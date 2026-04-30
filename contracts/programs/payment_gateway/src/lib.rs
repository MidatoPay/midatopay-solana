use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("DpVyTLLtthqVWsiGjoz3hWnvF8ugHTqhRsB1SY9Rp5zu");

#[program]
pub mod payment_gateway {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        oracle_program: Pubkey,
    ) -> Result<()> {
        require!(admin != Pubkey::default(), GatewayError::AdminZero);
        require!(oracle_program != Pubkey::default(), GatewayError::OracleZero);

        let cfg = &mut ctx.accounts.gateway_config;
        cfg.admin = admin;
        cfg.oracle_program = oracle_program;
        cfg.bump = ctx.bumps.gateway_config;

        Ok(())
    }

    pub fn pay(
        ctx: Context<Pay>,
        amount_ars: u64,
        payment_id: [u8; 32],
    ) -> Result<()> {
        require!(amount_ars > 0, GatewayError::AmountZero);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.gateway_config.admin,
            GatewayError::OnlyAdmin
        );

        // valida que la cuenta oracle venga del programa oracle esperado
        require!(
            ctx.accounts.oracle_price.to_account_info().owner
                == &ctx.accounts.gateway_config.oracle_program,
            GatewayError::InvalidOracleOwner
        );

        let oracle_cfg_data = ctx.accounts.oracle_config.try_borrow_data()?;
        let mut oracle_cfg_slice: &[u8] = &oracle_cfg_data[8..];
        let oracle_cfg =
            OracleConfigMirror::deserialize(&mut oracle_cfg_slice).map_err(|_| error!(GatewayError::InvalidOracleData))?;
        require!(oracle_cfg.active, GatewayError::OraclePaused);

        let oracle_price_data = ctx.accounts.oracle_price.try_borrow_data()?;
        let mut oracle_price_slice: &[u8] = &oracle_price_data[8..];
        let oracle_price =
            PriceAccountMirror::deserialize(&mut oracle_price_slice).map_err(|_| error!(GatewayError::InvalidOracleData))?;
        require!(
            oracle_price.token_mint == ctx.accounts.token_mint.key(),
            GatewayError::InvalidOracleMint
        );

        let mint_decimals = ctx.accounts.token_mint.decimals;
        require!(
            oracle_price.decimals == mint_decimals,
            GatewayError::DecimalsMismatch
        );

        // equivalente a: (amountARS * 10**decimals) / price
        let factor = 10u128
            .checked_pow(mint_decimals as u32)
            .ok_or(GatewayError::MathOverflow)?;

        let amount_token_u128 = (amount_ars as u128)
            .checked_mul(factor)
            .ok_or(GatewayError::MathOverflow)?
            .checked_div(oracle_price.price_ars as u128)
            .ok_or(GatewayError::QuoteZero)?;

        require!(amount_token_u128 > 0, GatewayError::QuoteZero);

        let amount_token =
            u64::try_from(amount_token_u128).map_err(|_| error!(GatewayError::MathOverflow))?;

        require!(
            ctx.accounts.gateway_vault.amount >= amount_token,
            GatewayError::NotEnoughBalance
        );

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"gateway_config",
            &[ctx.accounts.gateway_config.bump],
        ]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.gateway_vault.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.merchant_token_account.to_account_info(),
            authority: ctx.accounts.gateway_config.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );

        token_interface::transfer_checked(cpi_ctx, amount_token, mint_decimals)?;

        let processed = &mut ctx.accounts.processed_payment;
        processed.payment_id = payment_id;
        processed.merchant = ctx.accounts.merchant.key();
        processed.token_mint = ctx.accounts.token_mint.key();
        processed.amount = amount_token;
        processed.bump = ctx.bumps.processed_payment;

        emit!(PaymentProcessed {
            id: payment_id,
            merchant: ctx.accounts.merchant.key(),
            token: ctx.accounts.token_mint.key(),
            amount: amount_token,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + GatewayConfig::INIT_SPACE,
        seeds = [b"gateway_config"],
        bump
    )]
    pub gateway_config: Account<'info, GatewayConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount_ars: u64, payment_id: [u8; 32])]
pub struct Pay<'info> {
    #[account(
        mut,
        seeds = [b"gateway_config"],
        bump = gateway_config.bump
    )]
    pub gateway_config: Account<'info, GatewayConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: wallet del merchant, solo se usa su pubkey para validar token account y registrar el pago
    pub merchant: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = gateway_config,
        token::token_program = token_program
    )]
    pub gateway_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = merchant,
        token::token_program = token_program
    )]
    pub merchant_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        space = 8 + ProcessedPayment::INIT_SPACE,
        seeds = [b"processed_payment".as_ref(), payment_id.as_ref()],
        bump
    )]
    pub processed_payment: Account<'info, ProcessedPayment>,

    // Cuentas del oracle
    /// CHECK: se valida owner=oracle_program y se deserializa manualmente
    #[account(owner = gateway_config.oracle_program)]
    pub oracle_config: UncheckedAccount<'info>,
    /// CHECK: se valida owner=oracle_program y se deserializa manualmente
    #[account(owner = gateway_config.oracle_program)]
    pub oracle_price: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct GatewayConfig {
    pub admin: Pubkey,
    pub oracle_program: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProcessedPayment {
    pub payment_id: [u8; 32],
    pub merchant: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

// Mirrors de las cuentas del programa oracle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OracleConfigMirror {
    pub admin: Pubkey,
    pub active: bool,
    pub last_updated: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceAccountMirror {
    pub token_mint: Pubkey,
    pub price_ars: u64,
    pub decimals: u8,
    pub bump: u8,
}

#[event]
pub struct PaymentProcessed {
    pub id: [u8; 32],
    pub merchant: Pubkey,
    pub token: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum GatewayError {
    #[msg("admin=0")]
    AdminZero,
    #[msg("oracle=0")]
    OracleZero,
    #[msg("only admin")]
    OnlyAdmin,
    #[msg("amount=0")]
    AmountZero,
    #[msg("oracle paused")]
    OraclePaused,
    #[msg("invalid oracle owner")]
    InvalidOracleOwner,
    #[msg("invalid oracle mint")]
    InvalidOracleMint,
    #[msg("decimals mismatch")]
    DecimalsMismatch,
    #[msg("quote=0")]
    QuoteZero,
    #[msg("not enough balance")]
    NotEnoughBalance,
    #[msg("math overflow")]
    MathOverflow,
    #[msg("invalid oracle data")]
    InvalidOracleData,
}
