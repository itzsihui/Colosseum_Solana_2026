import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";
import {
  anchorErrorName,
  borrowIx,
  newQuoteId,
  payWithCreditIxs,
  pda,
  programs,
  repayIx,
  sessionIndex,
  skuHash,
  snapshot,
} from "../sdk/client";
import { bootstrap, nvda, usdc, World } from "../sdk/bootstrap";

describe("Borneo x Intatto: the demo story", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const { intatto, checkout } = programs(provider);
  const conn = provider.connection;

  let w: World;
  const merchants = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const cart = [
    { slug: "island-linen", sku: "linen-camp-shirt-white", usd: 139 },
    { slug: "canopy-wear", sku: "linen-shorts-ivory", usd: 95 },
    { slug: "tropic-step", sku: "canvas-espadrille-natural", usd: 115 },
  ];

  async function lockQuote(lines: { merchant: PublicKey; usd: number; slug: string; sku: string }[]) {
    const quoteId = newQuoteId();
    const quote = pda.quote(w.buyer.publicKey, Uint8Array.from(quoteId));
    await checkout.methods
      .lockQuote(
        quoteId,
        lines.map((l) => ({ merchant: l.merchant, amount: usdc(l.usd), skuHash: skuHash(l.slug, l.sku) })),
        new BN(Math.floor(Date.now() / 1000) + 600),
      )
      .accountsPartial({
        quoteAuthority: w.quoteAuthority.publicKey,
        config: pda.config(w.usdcMint),
        buyer: w.buyer.publicKey,
        quote,
      })
      .signers([w.quoteAuthority])
      .rpc();
    return quote;
  }

  async function send(ixs: anchor.web3.TransactionInstruction[], signers: Keypair[]) {
    const tx = new Transaction().add(...ixs);
    return provider.sendAndConfirm(tx, signers);
  }

  async function expectError(p: Promise<unknown>, code: string) {
    try {
      await p;
    } catch (e) {
      expect(anchorErrorName(e)).to.equal(code);
      return;
    }
    expect.fail(`expected ${code}`);
  }

  const keeperUpdate = (price: number, session: "Regular" | "Extended" | "Overnight" | "Closed") =>
    intatto.methods
      .updateMarket(usdc(price), sessionIndex(session))
      .accountsPartial({ keeper: w.keeper.publicKey, market: w.market })
      .signers([w.keeper])
      .rpc();

  before(async () => {
    w = await bootstrap(provider, { price: 226, session: "Overnight", buyerUsdc: 100 });
  });

  it("only Borneo's quote authority can lock a quote", async () => {
    const quoteId = newQuoteId();
    const fake = Keypair.generate();
    await expectError(
      checkout.methods
        .lockQuote(quoteId, [{ merchant: fake.publicKey, amount: usdc(1), skuHash: skuHash("x", "y") }], new BN(Math.floor(Date.now() / 1000) + 600))
        .accountsPartial({
          quoteAuthority: w.buyer.publicKey,
          config: pda.config(w.usdcMint),
          buyer: w.buyer.publicKey,
          quote: pda.quote(w.buyer.publicKey, Uint8Array.from(quoteId)),
        })
        .signers([w.buyer])
        .rpc(),
      "Unauthorized",
    );
  });

  it("the agent cannot redirect payment to another merchant", async () => {
    const quote = await lockQuote(cart.map((c, i) => ({ merchant: merchants[i].publicKey, usd: c.usd, slug: c.slug, sku: c.sku })));
    const attacker = Keypair.generate();
    const ixs = await payWithCreditIxs({
      intatto, checkout, m: w, owner: w.buyer.publicKey,
      depositAmount: new BN(0), borrowAmount: new BN(0), quote,
      merchants: [attacker.publicKey, merchants[1].publicKey, merchants[2].publicKey],
    });
    await expectError(send(ixs, [w.buyer]), "MerchantMismatch");
  });

  it("weekday overnight: deposits 4.5 NVDAx, borrows $349, pays three merchants in one transaction", async () => {
    const quote = await lockQuote(cart.map((c, i) => ({ merchant: merchants[i].publicKey, usd: c.usd, slug: c.slug, sku: c.sku })));
    const ixs = await payWithCreditIxs({
      intatto, checkout, m: w, owner: w.buyer.publicKey,
      depositAmount: nvda(4.5), borrowAmount: usdc(349), quote,
      merchants: merchants.map((m) => m.publicKey),
    });
    await send(ixs, [w.buyer]);

    for (let i = 0; i < 3; i++) {
      const ata = getAssociatedTokenAddressSync(w.usdcMint, merchants[i].publicKey);
      expect(Number((await getAccount(conn, ata)).amount)).to.equal(cart[i].usd * 1e6);
    }
    const q = await checkout.account.quote.fetch(quote);
    expect(q.paid).to.equal(true);

    const s = await snapshot(intatto, w, w.buyer.publicKey);
    expect(s.collateral).to.equal(4.5);
    expect(s.debt).to.equal(349);
    expect(s.ltvPct).to.be.closeTo(34.3, 0.1); // under the 40% overnight limit
    expect(s.liqDropPct!).to.be.closeTo(47.2, 0.5); // "NVIDIA would have to fall nearly half"
    // Cash untouched: the $100 is still there.
    const buyerUsdc = getAssociatedTokenAddressSync(w.usdcMint, w.buyer.publicKey);
    expect(Number((await getAccount(conn, buyerUsdc)).amount)).to.equal(100e6);
  });

  it("a settled quote cannot be paid twice", async () => {
    const buyerUsdc = getAssociatedTokenAddressSync(w.usdcMint, w.buyer.publicKey);
    await mintTo(conn, w.admin, w.usdcMint, buyerUsdc, w.admin, 2e6); // covers this $1 test and the $1 stale-price repay
    const quote = await lockQuote([{ merchant: merchants[0].publicKey, usd: 1, slug: "a", sku: "b" }]);
    const ixs = await payWithCreditIxs({ intatto, checkout, m: w, owner: w.buyer.publicKey, depositAmount: new BN(0), borrowAmount: new BN(0), quote, merchants: [merchants[0].publicKey] });
    await send(ixs, [w.buyer]);
    const again = await payWithCreditIxs({ intatto, checkout, m: w, owner: w.buyer.publicKey, depositAmount: new BN(0), borrowAmount: new BN(0), quote, merchants: [merchants[0].publicKey] });
    await expectError(send(again.slice(-1), [w.buyer]), "AlreadyPaid");
  });

  it("Saturday: the limit drops to 28%, and the $45 sun hat is refused with nothing moved", async () => {
    await keeperUpdate(226, "Closed");
    const s = await snapshot(intatto, w, w.buyer.publicKey);
    expect(s.limitPct).to.equal(28);
    expect(s.ltvPct).to.be.greaterThan(s.limitPct);

    const hatMerchant = Keypair.generate();
    const quote = await lockQuote([{ merchant: hatMerchant.publicKey, usd: 45, slug: "canopy-wear", sku: "packable-hat-khaki" }]);
    const ixs = await payWithCreditIxs({
      intatto, checkout, m: w, owner: w.buyer.publicKey,
      depositAmount: new BN(0), borrowAmount: usdc(45), quote, merchants: [hatMerchant.publicKey],
    });
    await expectError(send(ixs, [w.buyer]), "SessionLimit");
    const after = await snapshot(intatto, w, w.buyer.publicKey);
    expect(after.debt).to.equal(349);
  });

  it("Saturday: repay still works, and the loan-to-value drops", async () => {
    await send([await repayIx(intatto, w, w.buyer.publicKey, w.buyer.publicKey, usdc(100))], [w.buyer]);
    const s = await snapshot(intatto, w, w.buyer.publicKey);
    expect(s.debt).to.equal(249);
    expect(s.ltvPct).to.be.closeTo(24.5, 0.1);
    expect(s.ltvPct).to.be.lessThan(s.limitPct);
  });

  it("the keeper cannot jump the price more than 20% in one update, and others cannot update at all", async () => {
    await expectError(keeperUpdate(150, "Closed"), "PriceMoveTooLarge");
    await expectError(
      intatto.methods.updateMarket(usdc(226), 0).accountsPartial({ keeper: w.buyer.publicKey, market: w.market }).signers([w.buyer]).rpc(),
      "Unauthorized",
    );
  });

  it("if the keeper goes quiet, borrowing stops but repay stays open", async () => {
    const p = { ...(await intatto.account.market.fetch(w.market)) };
    const params = {
      keeper: w.keeper.publicKey,
      limitBps: p.limitBps,
      liqBps: p.liqBps,
      liqBonusBps: p.liqBonusBps,
      maxSliceBps: p.maxSliceBps,
      maxPriceMoveBps: p.maxPriceMoveBps,
      maxStalenessSecs: new BN(1),
    };
    await intatto.methods.setParams(params).accountsPartial({ admin: w.admin.publicKey, market: w.market }).rpc();
    await keeperUpdate(226, "Regular");
    await new Promise((r) => setTimeout(r, 3000));
    await expectError(send([await borrowIx(intatto, w, w.buyer.publicKey, usdc(1))], [w.buyer]), "StalePrice");
    await send([await repayIx(intatto, w, w.buyer.publicKey, w.buyer.publicKey, usdc(1))], [w.buyer]);
    expect((await snapshot(intatto, w, w.buyer.publicKey)).debt).to.equal(248);
    await intatto.methods.setParams({ ...params, maxStalenessSecs: new BN(3600) }).accountsPartial({ admin: w.admin.publicKey, market: w.market }).rpc();
  });

  it("a deep gap makes the position liquidatable, and liquidation runs in slices", async () => {
    // Walk the price down within the per-update bound: 226 -> 80.
    for (const px of [190, 160, 130, 110, 90, 80]) await keeperUpdate(px, "Closed");
    const before = await snapshot(intatto, w, w.buyer.publicKey);
    expect(before.ltvPct).to.be.greaterThan(65);

    const liquidator = w.admin;
    const liqUsdc = getAssociatedTokenAddressSync(w.usdcMint, liquidator.publicKey);
    const liqNvda = await getOrCreateAssociatedTokenAccount(conn, liquidator, w.collateralMint, liquidator.publicKey);
    await mintTo(conn, liquidator, w.usdcMint, liqUsdc, liquidator, 1_000e6);
    await intatto.methods
      .liquidate(usdc(1_000))
      .accountsPartial({
        liquidator: liquidator.publicKey,
        market: w.market,
        position: pda.position(w.market, w.buyer.publicKey),
        usdcMint: w.usdcMint,
        collateralMint: w.collateralMint,
        liquidatorUsdc: liqUsdc,
        liquidatorCollateral: liqNvda.address,
        usdcVault: pda.usdcVault(w.market),
        collateralVault: pda.collateralVault(w.market),
        usdcProgram: TOKEN_PROGRAM_ID,
        collateralProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const after = await snapshot(intatto, w, w.buyer.publicKey);
    expect(after.debt).to.equal(124); // one slice: half of $248
    expect(after.ltvPct).to.be.lessThan(before.ltvPct);
  });
});
