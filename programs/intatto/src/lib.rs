//! Intatto: stock-backed credit whose borrow limit follows the US market session.
//!
//! A shopper deposits a tokenized stock (e.g. NVDAx, an SPL / Token-2022 mint) and
//! borrows USDC against it. The keeper relays the stock price and the current US
//! market session. New borrowing is capped by a per-session loan-to-value limit
//! (lower overnight, lowest when Nasdaq is closed), because weekend news only hits
//! the real price at Monday's open. Repaying is always allowed, in every session and
//! even when the keeper has gone quiet, so a borrower can always reduce risk.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("6SPpSd6984j65tmNMJh3SgUxqeUbFFrDXaiisSu9oX1C");

pub const BPS: u128 = 10_000;
pub const SESSION_COUNT: usize = 4;

/// US equity market session, relayed by the keeper.
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Session {
    /// Nasdaq regular hours, 09:30-16:00 ET.
    Regular = 0,
    /// Pre-market and after-hours.
    Extended = 1,
    /// Overnight trading on the token only.
    Overnight = 2,
    /// Weekend or holiday: no reference price until the next open.
    Closed = 3,
}

#[program]
pub mod intatto {
    use super::*;

    pub fn init_market(ctx: Context<InitMarket>, params: MarketParams) -> Result<()> {
        params.validate()?;
        let m = &mut ctx.accounts.market;
        m.admin = ctx.accounts.admin.key();
        m.keeper = params.keeper;
        m.collateral_mint = ctx.accounts.collateral_mint.key();
        m.usdc_mint = ctx.accounts.usdc_mint.key();
        m.collateral_vault = ctx.accounts.collateral_vault.key();
        m.usdc_vault = ctx.accounts.usdc_vault.key();
        m.collateral_decimals = ctx.accounts.collateral_mint.decimals;
        m.usdc_decimals = ctx.accounts.usdc_mint.decimals;
        m.limit_bps = params.limit_bps;
        m.liq_bps = params.liq_bps;
        m.liq_bonus_bps = params.liq_bonus_bps;
        m.max_slice_bps = params.max_slice_bps;
        m.max_price_move_bps = params.max_price_move_bps;
        m.max_staleness_secs = params.max_staleness_secs;
        m.session = Session::Closed as u8;
        m.bump = ctx.bumps.market;
        m.vault_bump = ctx.bumps.usdc_vault;
        m.collateral_vault_bump = ctx.bumps.collateral_vault;
        Ok(())
    }

    /// Admin can retune risk parameters (never the keeper).
    pub fn set_params(ctx: Context<AdminOnly>, params: MarketParams) -> Result<()> {
        params.validate()?;
        let m = &mut ctx.accounts.market;
        m.keeper = params.keeper;
        m.limit_bps = params.limit_bps;
        m.liq_bps = params.liq_bps;
        m.liq_bonus_bps = params.liq_bonus_bps;
        m.max_slice_bps = params.max_slice_bps;
        m.max_price_move_bps = params.max_price_move_bps;
        m.max_staleness_secs = params.max_staleness_secs;
        Ok(())
    }

    /// Keeper relays price (USDC atoms per whole token) and market session.
    /// A single update cannot move the price more than `max_price_move_bps`.
    pub fn update_market(ctx: Context<KeeperOnly>, price: u64, session: u8) -> Result<()> {
        require!(price > 0, IntattoError::BadPrice);
        require!((session as usize) < SESSION_COUNT, IntattoError::BadSession);
        let m = &mut ctx.accounts.market;
        if m.price > 0 {
            let old = m.price as u128;
            let new = price as u128;
            let diff = if new > old { new - old } else { old - new };
            require!(
                diff * BPS <= old * m.max_price_move_bps as u128,
                IntattoError::PriceMoveTooLarge
            );
        }
        m.price = price;
        m.session = session;
        m.price_updated_at = Clock::get()?.unix_timestamp;
        emit!(MarketUpdated {
            price,
            session,
            limit_bps: m.limit_bps[session as usize],
            ts: m.price_updated_at,
        });
        Ok(())
    }

    /// Lenders supply USDC to the pool.
    pub fn supply(ctx: Context<Supply>, amount: u64) -> Result<()> {
        require!(amount > 0, IntattoError::ZeroAmount);
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.lender_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.lender.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
        let m = &mut ctx.accounts.market;
        m.total_supplied = m.total_supplied.checked_add(amount).ok_or(IntattoError::Math)?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, IntattoError::ZeroAmount);
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.collateral_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.owner_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.collateral_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.collateral_mint.decimals,
        )?;
        let p = &mut ctx.accounts.position;
        if p.owner == Pubkey::default() {
            p.owner = ctx.accounts.owner.key();
            p.market = ctx.accounts.market.key();
            p.bump = ctx.bumps.position;
        }
        p.collateral = p.collateral.checked_add(amount).ok_or(IntattoError::Math)?;
        emit!(PositionChanged::from(p, "deposit"));
        Ok(())
    }

    /// Borrow USDC. Refused if the price is stale or the new loan-to-value would
    /// exceed the limit for the current market session.
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, IntattoError::ZeroAmount);
        let m = &ctx.accounts.market;
        m.require_fresh()?;
        let p = &mut ctx.accounts.position;
        let new_debt = p.debt.checked_add(amount).ok_or(IntattoError::Math)?;
        let ltv = m.ltv_bps(p.collateral, new_debt)?;
        let limit = m.limit_bps[m.session as usize] as u128;
        require!(ltv <= limit, IntattoError::SessionLimit);

        let seeds: &[&[u8]] = &[b"market", m.collateral_mint.as_ref(), m.usdc_mint.as_ref(), &[m.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.usdc_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.owner_usdc.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
        p.debt = new_debt;
        let m = &mut ctx.accounts.market;
        m.total_debt = m.total_debt.checked_add(amount).ok_or(IntattoError::Math)?;
        emit!(PositionChanged::from(p, "borrow"));
        Ok(())
    }

    /// Repay is always open: any session, stale price or not.
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        let p = &mut ctx.accounts.position;
        let amount = amount.min(p.debt);
        require!(amount > 0, IntattoError::ZeroAmount);
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payer_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
        p.debt -= amount;
        let m = &mut ctx.accounts.market;
        m.total_debt = m.total_debt.saturating_sub(amount);
        emit!(PositionChanged::from(p, "repay"));
        Ok(())
    }

    /// Withdraw collateral. Needs a fresh price and must stay within the session limit.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, IntattoError::ZeroAmount);
        let m = &ctx.accounts.market;
        let p = &mut ctx.accounts.position;
        let left = p.collateral.checked_sub(amount).ok_or(IntattoError::InsufficientCollateral)?;
        if p.debt > 0 {
            m.require_fresh()?;
            let ltv = m.ltv_bps(left, p.debt)?;
            require!(ltv <= m.limit_bps[m.session as usize] as u128, IntattoError::SessionLimit);
        }
        let seeds: &[&[u8]] = &[b"market", m.collateral_mint.as_ref(), m.usdc_mint.as_ref(), &[m.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.collateral_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.collateral_vault.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.owner_collateral.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.collateral_mint.decimals,
        )?;
        p.collateral = left;
        emit!(PositionChanged::from(p, "withdraw"));
        Ok(())
    }

    /// Liquidate an unhealthy position in slices: repay at most `max_slice_bps` of the
    /// debt per call and receive collateral worth the repaid amount plus a bonus.
    /// If collateral runs out, the unpaid remainder is written off as recorded bad debt.
    pub fn liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
        let m = &ctx.accounts.market;
        m.require_fresh()?;
        let p = &mut ctx.accounts.position;
        let ltv = m.ltv_bps(p.collateral, p.debt)?;
        require!(ltv > m.liq_bps as u128, IntattoError::Healthy);

        let max_slice = ((p.debt as u128 * m.max_slice_bps as u128) / BPS).max(1) as u64;
        let mut repay = repay_amount.min(max_slice).min(p.debt);
        require!(repay > 0, IntattoError::ZeroAmount);

        // collateral to seize = repay * (1 + bonus) / price
        let mut seize = m.collateral_for_usdc(
            (repay as u128 * (BPS + m.liq_bonus_bps as u128)) / BPS,
        )?;
        if seize > p.collateral {
            seize = p.collateral;
            // Scale repay down to what the remaining collateral covers.
            let value = m.usdc_value(seize)?;
            repay = ((value * BPS) / (BPS + m.liq_bonus_bps as u128)).min(repay as u128) as u64;
        }

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.liquidator_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.liquidator.to_account_info(),
                },
            ),
            repay,
            ctx.accounts.usdc_mint.decimals,
        )?;
        let seeds: &[&[u8]] = &[b"market", m.collateral_mint.as_ref(), m.usdc_mint.as_ref(), &[m.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.collateral_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.collateral_vault.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.liquidator_collateral.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            seize,
            ctx.accounts.collateral_mint.decimals,
        )?;

        p.debt -= repay;
        p.collateral -= seize;
        let m = &mut ctx.accounts.market;
        m.total_debt = m.total_debt.saturating_sub(repay);
        if p.collateral == 0 && p.debt > 0 {
            m.bad_debt = m.bad_debt.checked_add(p.debt).ok_or(IntattoError::Math)?;
            m.total_debt = m.total_debt.saturating_sub(p.debt);
            p.debt = 0;
        }
        emit!(PositionChanged::from(p, "liquidate"));
        Ok(())
    }
}

// ---------------------------------------------------------------- state

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MarketParams {
    pub keeper: Pubkey,
    /// New-borrow LTV limit per session [Regular, Extended, Overnight, Closed], in bps.
    pub limit_bps: [u16; SESSION_COUNT],
    pub liq_bps: u16,
    pub liq_bonus_bps: u16,
    pub max_slice_bps: u16,
    pub max_price_move_bps: u16,
    pub max_staleness_secs: i64,
}

impl MarketParams {
    fn validate(&self) -> Result<()> {
        for l in self.limit_bps {
            require!(l < self.liq_bps, IntattoError::BadParams);
        }
        require!(self.liq_bps < 10_000, IntattoError::BadParams);
        require!(self.liq_bonus_bps <= 2_000, IntattoError::BadParams);
        require!(self.max_slice_bps > 0 && self.max_slice_bps <= 10_000, IntattoError::BadParams);
        require!(self.max_price_move_bps > 0, IntattoError::BadParams);
        require!(self.max_staleness_secs > 0, IntattoError::BadParams);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub collateral_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub collateral_vault: Pubkey,
    pub usdc_vault: Pubkey,
    pub collateral_decimals: u8,
    pub usdc_decimals: u8,
    /// USDC atoms per one whole collateral token.
    pub price: u64,
    pub price_updated_at: i64,
    pub session: u8,
    pub limit_bps: [u16; SESSION_COUNT],
    pub liq_bps: u16,
    pub liq_bonus_bps: u16,
    pub max_slice_bps: u16,
    pub max_price_move_bps: u16,
    pub max_staleness_secs: i64,
    pub total_supplied: u64,
    pub total_debt: u64,
    pub bad_debt: u64,
    pub bump: u8,
    pub vault_bump: u8,
    pub collateral_vault_bump: u8,
}

impl Market {
    fn require_fresh(&self) -> Result<()> {
        require!(self.price > 0, IntattoError::StalePrice);
        let now = Clock::get()?.unix_timestamp;
        require!(
            now.saturating_sub(self.price_updated_at) <= self.max_staleness_secs,
            IntattoError::StalePrice
        );
        Ok(())
    }

    fn usdc_value(&self, collateral: u64) -> Result<u128> {
        Ok((collateral as u128 * self.price as u128) / 10u128.pow(self.collateral_decimals as u32))
    }

    fn collateral_for_usdc(&self, usdc: u128) -> Result<u64> {
        require!(self.price > 0, IntattoError::StalePrice);
        let c = (usdc * 10u128.pow(self.collateral_decimals as u32)) / self.price as u128;
        u64::try_from(c).map_err(|_| error!(IntattoError::Math))
    }

    /// Loan-to-value in bps. Infinite (u128::MAX) if there is debt but no collateral.
    pub fn ltv_bps(&self, collateral: u64, debt: u64) -> Result<u128> {
        if debt == 0 {
            return Ok(0);
        }
        let value = self.usdc_value(collateral)?;
        if value == 0 {
            return Ok(u128::MAX);
        }
        Ok((debt as u128 * BPS) / value)
    }
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral: u64,
    pub debt: u64,
    pub bump: u8,
}

// ---------------------------------------------------------------- accounts

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, payer = admin, space = 8 + Market::INIT_SPACE,
        seeds = [b"market", collateral_mint.key().as_ref(), usdc_mint.key().as_ref()], bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init, payer = admin,
        seeds = [b"collateral_vault", market.key().as_ref()], bump,
        token::mint = collateral_mint, token::authority = market,
        token::token_program = collateral_program,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init, payer = admin,
        seeds = [b"usdc_vault", market.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = market,
        token::token_program = usdc_program,
    )]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    pub collateral_program: Interface<'info, TokenInterface>,
    pub usdc_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin @ IntattoError::Unauthorized)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct KeeperOnly<'info> {
    pub keeper: Signer<'info>,
    #[account(mut, has_one = keeper @ IntattoError::Unauthorized)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct Supply<'info> {
    pub lender: Signer<'info>,
    #[account(mut, has_one = usdc_vault, has_one = usdc_mint)]
    pub market: Account<'info, Market>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint)]
    pub lender_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(has_one = collateral_vault, has_one = collateral_mint)]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed, payer = owner, space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump
    )]
    pub position: Account<'info, Position>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = collateral_mint)]
    pub owner_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub collateral_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = usdc_vault, has_one = usdc_mint)]
    pub market: Account<'info, Market>,
    #[account(
        mut, has_one = owner, has_one = market,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump = position.bump
    )]
    pub position: Account<'info, Position>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint)]
    pub owner_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    /// Anyone may repay on behalf of a position.
    pub payer: Signer<'info>,
    #[account(mut, has_one = usdc_vault, has_one = usdc_mint)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint)]
    pub payer_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    #[account(has_one = collateral_vault, has_one = collateral_mint)]
    pub market: Account<'info, Market>,
    #[account(
        mut, has_one = owner, has_one = market,
        seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump = position.bump
    )]
    pub position: Account<'info, Position>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = collateral_mint)]
    pub owner_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub collateral_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub liquidator: Signer<'info>,
    #[account(
        mut, has_one = usdc_vault, has_one = usdc_mint,
        has_one = collateral_vault, has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint)]
    pub liquidator_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = collateral_mint)]
    pub liquidator_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    pub usdc_program: Interface<'info, TokenInterface>,
    pub collateral_program: Interface<'info, TokenInterface>,
}

// ---------------------------------------------------------------- events & errors

#[event]
pub struct MarketUpdated {
    pub price: u64,
    pub session: u8,
    pub limit_bps: u16,
    pub ts: i64,
}

#[event]
pub struct PositionChanged {
    pub owner: Pubkey,
    pub collateral: u64,
    pub debt: u64,
    pub action: String,
}

impl PositionChanged {
    fn from(p: &Position, action: &str) -> Self {
        Self { owner: p.owner, collateral: p.collateral, debt: p.debt, action: action.to_string() }
    }
}

#[error_code]
pub enum IntattoError {
    #[msg("New borrowing would exceed the loan-to-value limit for the current market session")]
    SessionLimit,
    #[msg("Price is stale: the keeper has not updated recently, so new borrowing is paused")]
    StalePrice,
    #[msg("Price update moves more than the allowed bound in one step")]
    PriceMoveTooLarge,
    #[msg("Position is healthy and cannot be liquidated")]
    Healthy,
    #[msg("Not enough collateral")]
    InsufficientCollateral,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid price")]
    BadPrice,
    #[msg("Invalid session")]
    BadSession,
    #[msg("Invalid market parameters")]
    BadParams,
    #[msg("Signer is not authorized")]
    Unauthorized,
    #[msg("Math overflow")]
    Math,
}
