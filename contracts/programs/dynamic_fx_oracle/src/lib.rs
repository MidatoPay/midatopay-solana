use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

declare_id!("BwaGWVKhAQEUNENoXdnPDeciT4ct97s3u5mRjE4iJMkP");

#[program]
pub mod dynamic_fx_oracle {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        require!(admin != Pubkey::default(), OracleError::AdminZero);

        let cfg = &mut ctx.accounts.oracle_config;
        cfg.admin = admin;
        cfg.active = true;
        cfg.last_updated = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn set_price(ctx: Context<SetPrice>, human_price: u64) -> Result<()> {
        require!(human_price > 0, OracleError::PriceZero);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.oracle_config.admin,
            OracleError::NotAdmin
        );

        let cfg = &mut ctx.accounts.oracle_config;
        let price = &mut ctx.accounts.price_account;
        let mint = &ctx.accounts.token_mint;

        price.token_mint = mint.key();
        price.price_ars = human_price;
        price.decimals = mint.decimals;
        price.bump = ctx.bumps.price_account;

        cfg.last_updated = Clock::get()?.unix_timestamp;

        emit!(PriceUpdated {
            token: mint.key(),
            new_price: human_price,
            timestamp: cfg.last_updated,
        });

        Ok(())
    }

    pub fn pause(ctx: Context<ToggleActive>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.oracle_config.admin,
            OracleError::NotAdmin
        );

        ctx.accounts.oracle_config.active = false;
        Ok(())
    }

    pub fn unpause(ctx: Context<ToggleActive>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.oracle_config.admin,
            OracleError::NotAdmin
        );

        ctx.accounts.oracle_config.active = true;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + OracleConfig::INIT_SPACE,
        seeds = [b"oracle_config"],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPrice<'info> {
    #[account(
        mut,
        seeds = [b"oracle_config"],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mint::token_program = token_program
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + PriceAccount::INIT_SPACE,
        seeds = [b"price", token_mint.key().as_ref()],
        bump
    )]
    pub price_account: Account<'info, PriceAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ToggleActive<'info> {
    #[account(
        mut,
        seeds = [b"oracle_config"],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub admin: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct OracleConfig {
    pub admin: Pubkey,
    pub active: bool,
    pub last_updated: i64,
}

#[account]
#[derive(InitSpace)]
pub struct PriceAccount {
    pub token_mint: Pubkey,
    pub price_ars: u64, // precio "humano" en ARS por 1 token entero
    pub decimals: u8,
    pub bump: u8,
}

#[event]
pub struct PriceUpdated {
    pub token: Pubkey,
    pub new_price: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum OracleError {
    #[msg("admin=0")]
    AdminZero,
    #[msg("not admin")]
    NotAdmin,
    #[msg("price=0")]
    PriceZero,
}
