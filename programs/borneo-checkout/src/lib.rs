//! Borneo checkout: locked quotes that an AI shopping agent can settle but never alter.
//!
//! Borneo's quote service (the `quote_authority`) prices the agent's cart against real
//! merchant catalogs and writes a Quote account: one line per item with the merchant's
//! wallet, the exact amount, and a hash of the SKU. The buyer (or the agent acting for
//! them) can only *settle* that quote. Payees and amounts come from the Quote account,
//! never from the agent, so a prompt-injected listing cannot redirect the money.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("Eywhc9M2P3DVhq99LSaVbSye5apTYf6dSwk6uLCTJDEJ");

pub const MAX_LINES: usize = 6;

#[program]
pub mod borneo_checkout {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, quote_authority: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.quote_authority = quote_authority;
        c.usdc_mint = ctx.accounts.usdc_mint.key();
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_quote_authority(ctx: Context<SetQuoteAuthority>, quote_authority: Pubkey) -> Result<()> {
        ctx.accounts.config.quote_authority = quote_authority;
        Ok(())
    }

    /// Borneo's quote service locks a quote for a buyer.
    pub fn lock_quote(
        ctx: Context<LockQuote>,
        quote_id: [u8; 16],
        lines: Vec<QuoteLine>,
        expires_at: i64,
    ) -> Result<()> {
        require!(!lines.is_empty() && lines.len() <= MAX_LINES, CheckoutError::BadLines);
        let now = Clock::get()?.unix_timestamp;
        require!(expires_at > now, CheckoutError::Expired);
        let mut total: u64 = 0;
        for l in &lines {
            require!(l.amount > 0, CheckoutError::BadLines);
            total = total.checked_add(l.amount).ok_or(CheckoutError::Math)?;
        }
        let q = &mut ctx.accounts.quote;
        q.quote_id = quote_id;
        q.buyer = ctx.accounts.buyer.key();
        q.usdc_mint = ctx.accounts.config.usdc_mint;
        q.total = total;
        q.expires_at = expires_at;
        q.paid = false;
        q.lines = lines;
        q.bump = ctx.bumps.quote;
        emit!(QuoteLocked { quote: q.key(), buyer: q.buyer, total, lines: q.lines.len() as u8 });
        Ok(())
    }

    /// Settle a locked quote. `remaining_accounts` are the merchants' USDC token accounts,
    /// in line order; each must be owned by that line's merchant. Each line is paid exactly
    /// its locked amount from the buyer's USDC account.
    pub fn settle_quote<'info>(ctx: Context<'_, '_, 'info, 'info, SettleQuote<'info>>) -> Result<()> {
        let q = &ctx.accounts.quote;
        require!(!q.paid, CheckoutError::AlreadyPaid);
        require!(Clock::get()?.unix_timestamp <= q.expires_at, CheckoutError::Expired);
        require!(ctx.remaining_accounts.len() == q.lines.len(), CheckoutError::MerchantMismatch);

        let decimals = ctx.accounts.usdc_mint.decimals;
        for (line, acc) in q.lines.iter().zip(ctx.remaining_accounts.iter()) {
            let merchant_ta = InterfaceAccount::<TokenAccount>::try_from(acc)?;
            require_keys_eq!(merchant_ta.owner, line.merchant, CheckoutError::MerchantMismatch);
            require_keys_eq!(merchant_ta.mint, q.usdc_mint, CheckoutError::MerchantMismatch);
            token_interface::transfer_checked(
                CpiContext::new(
                    ctx.accounts.usdc_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.buyer_usdc.to_account_info(),
                        mint: ctx.accounts.usdc_mint.to_account_info(),
                        to: acc.clone(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                line.amount,
                decimals,
            )?;
        }
        let q = &mut ctx.accounts.quote;
        q.paid = true;
        emit!(QuoteSettled { quote: q.key(), buyer: q.buyer, total: q.total });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct QuoteLine {
    pub merchant: Pubkey,
    pub amount: u64,
    /// sha256 of "store-slug/sku-id", so the order is auditable onchain.
    pub sku_hash: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub quote_authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Quote {
    pub quote_id: [u8; 16],
    pub buyer: Pubkey,
    pub usdc_mint: Pubkey,
    pub total: u64,
    pub expires_at: i64,
    pub paid: bool,
    #[max_len(MAX_LINES)]
    pub lines: Vec<QuoteLine>,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config", usdc_mint.key().as_ref()], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetQuoteAuthority<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin @ CheckoutError::Unauthorized, seeds = [b"config", config.usdc_mint.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(quote_id: [u8; 16])]
pub struct LockQuote<'info> {
    #[account(mut)]
    pub quote_authority: Signer<'info>,
    #[account(has_one = quote_authority @ CheckoutError::Unauthorized, seeds = [b"config", config.usdc_mint.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: the buyer this quote is for; only this key can settle it.
    pub buyer: UncheckedAccount<'info>,
    #[account(
        init, payer = quote_authority, space = 8 + Quote::INIT_SPACE,
        seeds = [b"quote", buyer.key().as_ref(), quote_id.as_ref()], bump
    )]
    pub quote: Account<'info, Quote>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleQuote<'info> {
    pub buyer: Signer<'info>,
    #[account(mut, has_one = buyer @ CheckoutError::Unauthorized, has_one = usdc_mint)]
    pub quote: Account<'info, Quote>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = buyer)]
    pub buyer_usdc: InterfaceAccount<'info, TokenAccount>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct QuoteLocked {
    pub quote: Pubkey,
    pub buyer: Pubkey,
    pub total: u64,
    pub lines: u8,
}

#[event]
pub struct QuoteSettled {
    pub quote: Pubkey,
    pub buyer: Pubkey,
    pub total: u64,
}

#[error_code]
pub enum CheckoutError {
    #[msg("Quote must have 1-6 lines with non-zero amounts")]
    BadLines,
    #[msg("Quote has expired")]
    Expired,
    #[msg("Quote is already paid")]
    AlreadyPaid,
    #[msg("Merchant account does not match the locked quote")]
    MerchantMismatch,
    #[msg("Signer is not authorized")]
    Unauthorized,
    #[msg("Math overflow")]
    Math,
}
