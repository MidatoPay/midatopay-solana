use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, MintTo, TokenAccount, TokenInterface,
};

declare_id!("ESRwzP19W4xsc69xaxpSAnrttFH4K4JxERyBjMS4h68W");

#[program]
pub mod test_usdc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        require!(admin != Pubkey::default(), UsdcError::AdminZero);

        let cfg = &mut ctx.accounts.usdc_config;
        cfg.admin = admin;
        cfg.mint = ctx.accounts.usdc_mint.key();
        cfg.bump = ctx.bumps.usdc_config;
        cfg.mint_bump = ctx.bumps.usdc_mint;

        Ok(())
    }

    pub fn mint_to_user(ctx: Context<MintToUser>, amount: u64) -> Result<()> {
        require!(amount > 0, UsdcError::AmountZero);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.usdc_config.admin,
            UsdcError::NotAdmin
        );
        require!(
            ctx.accounts.usdc_mint.key() == ctx.accounts.usdc_config.mint,
            UsdcError::InvalidMint
        );

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"usdc_mint",
            &[ctx.accounts.usdc_config.mint_bump],
        ]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.usdc_mint.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );

        token_interface::mint_to(cpi_ctx, amount)?;

        emit!(UsdcMinted {
            to: ctx.accounts.destination.owner,
            amount,
        });

        Ok(())
    }

    pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), UsdcError::AdminZero);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.usdc_config.admin,
            UsdcError::NotAdmin
        );

        ctx.accounts.usdc_config.admin = new_admin;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + UsdcConfig::INIT_SPACE,
        seeds = [b"usdc_config"],
        bump
    )]
    pub usdc_config: Account<'info, UsdcConfig>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = usdc_mint,
        mint::freeze_authority = usdc_mint,
        seeds = [b"usdc_mint"],
        bump
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintToUser<'info> {
    #[account(
        seeds = [b"usdc_config"],
        bump = usdc_config.bump
    )]
    pub usdc_config: Account<'info, UsdcConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"usdc_mint"],
        bump = usdc_config.mint_bump
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::token_program = token_program
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(
        mut,
        seeds = [b"usdc_config"],
        bump = usdc_config.bump
    )]
    pub usdc_config: Account<'info, UsdcConfig>,

    pub admin: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct UsdcConfig {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
    pub mint_bump: u8,
}

#[event]
pub struct UsdcMinted {
    pub to: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum UsdcError {
    #[msg("admin=0")]
    AdminZero,
    #[msg("not admin")]
    NotAdmin,
    #[msg("amount=0")]
    AmountZero,
    #[msg("invalid mint")]
    InvalidMint,
}
