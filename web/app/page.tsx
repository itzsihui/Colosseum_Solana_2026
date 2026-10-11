"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Snap = {
  price: number;
  session: "Regular" | "Extended" | "Overnight" | "Closed";
  limitPct: number;
  liqPct: number;
  collateral: number;
  debt: number;
  ltvPct: number;
  liqDropPct: number | null;
};
type State =
  | { ready: false; error?: string }
  | {
      ready: true;
      day: "weekday" | "saturday";
      buyer: string;
      walletNvda: number;
      cash: number;
      snap: Snap;
      txs: { label: string; signature: string; url: string; ok: boolean }[];
    };
type Line = { storeSlug: string; storeName: string; skuId: string; title: string; usd: number; merchant: string };
type Quote = { address: string; lines: Line[]; total: number };
type Credit = {
  deposit: number;
  borrow: number;
  ltvAfter: number;
  limit: number;
  liqDrop: number;
  session: Snap["session"];
  ok: boolean;
  error: string | null;
  explain: string | null;
};
type PayResult = { ok: boolean; signature?: string; url?: string; steps?: string[]; error?: string; explain?: string };

type Msg =
  | { kind: "user"; text: string }
  | { kind: "chip"; text: string; tone?: "red" | "wait" }
  | { kind: "products"; lines: Line[] }
  | { kind: "quote"; quote: Quote }
  | { kind: "credit"; quote: Quote; credit: Credit; paid?: PayResult; paying?: boolean }
  | { kind: "agent"; text: string; tone?: "red" }
  | { kind: "error"; text: string };

const STEPS = ["Intent", "Find", "Lock quote", "Credit check", "Borrow & pay", "Repay"];
const EMOJI: Record<string, string> = { shirt: "👕", short: "🩳", espadrille: "👟", hat: "👒", dress: "👗", flat: "🥿", sandal: "🩴", tee: "👕", tank: "🎽" };
const icon = (t: string) => Object.entries(EMOJI).find(([k]) => t.toLowerCase().includes(k))?.[1] ?? "🛍️";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const SESSION_LABEL: Record<Snap["session"], string> = { Regular: "Regular hours", Extended: "Extended hours", Overnight: "Overnight session", Closed: "Saturday · US market closed" };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export default function Demo() {
  const [st, setSt] = useState<State>({ ready: false });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<number, "done" | "red">>({});
  const [history, setHistory] = useState<string[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setSt(await api<State>("/api/state"));
    } catch (e) {
      setSt({ ready: false, error: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const push = (...m: Msg[]) => setMsgs((x) => [...x, ...m]);
  const mark = (s: Record<number, "done" | "red">) => setSteps((x) => ({ ...x, ...s }));

  async function prepare() {
    setBusy("prepare");
    try {
      setSt(await api<State>("/api/prepare", {}));
      setMsgs([]);
      setSteps({});
      setHistory([]);
    } catch (e) {
      setSt({ ready: false, error: (e as Error).message });
    }
    setBusy(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy("chat");
    push({ kind: "user", text }, { kind: "chip", text: "Searching Borneo merchants", tone: "wait" });
    mark({ 0: "done" });
    try {
      const r = await api<{ reply: string; products?: Line[]; quote?: Quote; credit?: Credit }>("/api/chat", { message: text, history });
      setHistory((h) => [...h, text]);
      setMsgs((x) => x.filter((m) => !(m.kind === "chip" && m.tone === "wait")));
      if (!r.quote || !r.credit) {
        push({ kind: "chip", text: "Searched Borneo merchants" }, { kind: "agent", text: r.reply });
      } else {
        push(
          { kind: "chip", text: "Searched Borneo merchants" },
          { kind: "products", lines: r.quote.lines },
          { kind: "chip", text: "Locked prices and merchant addresses onchain" },
          { kind: "quote", quote: r.quote },
          { kind: "chip", text: "Asking Intatto's credit agent", tone: r.credit.ok ? undefined : "red" },
          { kind: "credit", quote: r.quote, credit: r.credit },
        );
        mark({ 1: "done", 2: "done", 3: r.credit.ok ? "done" : "red" });
        if (r.credit.ok) push({ kind: "agent", text: r.reply });
        else
          push({
            kind: "agent",
            tone: "red",
            text: `Intatto's contract said no: ${r.credit.explain}`,
          });
      }
    } catch (e) {
      setMsgs((x) => x.filter((m) => !(m.kind === "chip" && m.tone === "wait")));
      push({ kind: "error", text: (e as Error).message });
    }
    setBusy(null);
  }

  async function payQuote(q: Quote) {
    setBusy("pay");
    setMsgs((x) => x.map((m) => (m.kind === "credit" && m.quote.address === q.address ? { ...m, paying: true } : m)));
    try {
      const r = await api<PayResult>("/api/pay", { quote: q.address });
      setMsgs((x) => x.map((m) => (m.kind === "credit" && m.quote.address === q.address ? { ...m, paying: false, paid: r } : m)));
      if (r.ok) {
        mark({ 4: "done" });
        push({ kind: "agent", text: "Order placed. Merchants paid in USDC, and you still own all your NVIDIA." });
      } else push({ kind: "agent", tone: "red", text: `Intatto's contract said no: ${r.explain}` });
    } catch (e) {
      push({ kind: "error", text: (e as Error).message });
    }
    await refresh();
    setBusy(null);
  }

  async function jump() {
    if (!st.ready) return;
    setBusy("day");
    try {
      setSt(await api<State>("/api/session", { day: st.day === "weekday" ? "saturday" : "weekday" }));
    } catch (e) {
      push({ kind: "error", text: (e as Error).message });
    }
    setBusy(null);
  }

  async function repay() {
    setBusy("repay");
    try {
      const r = await api<{ state: State }>("/api/repay", { amount: 100 });
      setSt(r.state);
      mark({ 5: "done" });
    } catch (e) {
      push({ kind: "error", text: (e as Error).message });
    }
    setBusy(null);
  }

  const sat = st.ready && st.day === "saturday";
  const snap = st.ready ? st.snap : null;
  const over = snap ? snap.ltvPct > snap.limitPct : false;
  const pos = (v: number) => `${Math.min(100, (v / 70) * 100).toFixed(2)}%`;

  return (
    <div className="app">
      <header className="top">
        <span className="wm">Borneo × Intatto</span>
        <span className="pill">Solana</span>
        <span className="sp" />
        <span className={`pill ${st.ready ? "ok" : "warn"}`}>{st.ready ? "● Ready" : "Not prepared"}</span>
        <button className="btn" onClick={prepare} disabled={!!busy}>
          {busy === "prepare" ? "Preparing…" : "Prepare demo"}
        </button>
        <button className={`btn ${sat ? "" : "danger"}`} onClick={jump} disabled={!st.ready || !!busy}>
          {busy === "day" ? "Keeper updating…" : sat ? "Back to weekday" : "Jump to Saturday"}
        </button>
      </header>

      <div className="strip">
        {STEPS.map((n, i) => (
          <div key={n} className={`st ${steps[i] ?? ""}`}>
            <i>{steps[i] === "done" ? "✓" : steps[i] === "red" ? "✕" : i + 1}</i>
            {n}
          </div>
        ))}
      </div>

      {!st.ready && st.error && <div className="err">{st.error}. Start the validator (scripts/validator.sh), then press Prepare demo.</div>}

      <main className="main">
        <section className="col">
          <div className="chat" ref={chatRef}>
            {msgs.length === 0 && (
              <div className="empty">
                <b>Shop with stock you already own</b>
                {st.ready ? `${st.walletNvda + st.snap.collateral} NVDAx · ${usd(st.cash)} cash` : "Press Prepare demo to start"}
              </div>
            )}
            {msgs.map((m, i) => (
              <Message key={i} m={m} onPay={payQuote} busy={!!busy} />
            ))}
          </div>
          <form
            className="input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Linen outfit for a weekend in Bali, around $400" disabled={!st.ready} />
            <button className="btn primary" disabled={!st.ready || !!busy || !input.trim()}>
              {busy === "chat" ? "…" : "Send"}
            </button>
          </form>
        </section>

        <aside className="col">
          {snap ? (
            <>
              <div className={`clock ${sat ? "red" : "amber"}`}>
                {SESSION_LABEL[snap.session]}
                <span>{sat ? "Nasdaq reopens Mon 09:30 ET" : "Extended trading"} · new-borrow limit {snap.limitPct}%</span>
              </div>
              <div className="hold">
                <div>
                  <span>NVDAx (tokenized NVIDIA)</span>
                  <b>{+(st.ready ? st.walletNvda + snap.collateral : 0).toFixed(2)} NVDAx</b>
                  <span>
                    {st.ready ? +st.walletNvda.toFixed(2) : 0} wallet + {+snap.collateral.toFixed(2)} collateral · {usd(snap.price)}
                  </span>
                </div>
                <div>
                  <span>Cash</span>
                  <b>{usd(st.ready ? st.cash : 0)}</b>
                </div>
                <div>
                  <span>Debt</span>
                  <b>{usd(snap.debt)}</b>
                </div>
              </div>
              <div className="gauge">
                <div className="gtop">
                  <span>Loan-to-value</span>
                  <b>{snap.ltvPct.toFixed(0)}%</b>
                </div>
                <div className="track">
                  <div className="liq" style={{ width: `${((70 - snap.liqPct) / 70) * 100}%` }} />
                  <div className={`lim ${sat ? "red" : ""}`} style={{ left: pos(snap.limitPct) }}>
                    <em>New-borrow limit {snap.limitPct}%</em>
                  </div>
                  <div className={`dot ${over ? "warn" : ""}`} style={{ left: pos(snap.ltvPct) }} />
                </div>
                <div className="ticks">
                  {[0, 10, 20, 30, 40, 50, 60, 70].map((t) => (
                    <span key={t}>{t}%</span>
                  ))}
                </div>
                {over && <div className="gcap">Above today&apos;s limit: no new borrowing until Nasdaq reopens. Your loan is safe.</div>}
                {snap.liqDropPct !== null && !over && <div className="note">Liquidates only if NVIDIA falls {snap.liqDropPct.toFixed(0)}%</div>}
              </div>
              <button className="btn" onClick={repay} disabled={!!busy || snap.debt === 0}>
                {busy === "repay" ? "Repaying…" : "Repay $100"}
              </button>
              {st.ready && st.txs.length > 0 && (
                <div className="txlist">
                  <b>Onchain activity</b>
                  {[...st.txs].reverse().map((t) => (
                    <a key={t.signature} href={t.url} target="_blank" rel="noreferrer">
                      ✓ {t.label} · {short(t.signature)}
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <b>No demo world yet</b>Prepare demo mints 10 NVDAx and $100 for the shopper and opens the Intatto pool.
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function Message({ m, onPay, busy }: { m: Msg; onPay: (q: Quote) => void; busy: boolean }) {
  switch (m.kind) {
    case "user":
      return <div className="ub">{m.text}</div>;
    case "chip":
      return <div className={`chip ${m.tone ?? ""}`}>{m.text}</div>;
    case "agent":
      return <div className={`ab ${m.tone ?? ""}`}>{m.text}</div>;
    case "error":
      return <div className="err">{m.text}</div>;
    case "products":
      return (
        <div className="prods">
          {m.lines.map((l) => (
            <div className="pc" key={l.storeSlug + l.skuId}>
              <div className="img">{icon(l.title)}</div>
              <div className="t">
                <b>{l.title}</b>
                <span>
                  {l.storeName} · ${l.usd}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
    case "quote":
      return (
        <div className="quote">
          <div className="h">
            <span>Locked quote · {short(m.quote.address)}</span>
            <span>All that payment can see</span>
          </div>
          {m.quote.lines.map((l) => (
            <div className="r" key={l.storeSlug + l.skuId}>
              <span>{l.storeSlug}</span>
              <span>{usd(l.usd)}</span>
              <span>{short(l.merchant)}</span>
            </div>
          ))}
          <div className="tot">Total {usd(m.quote.total)}</div>
        </div>
      );
    case "credit": {
      const c = m.credit;
      const red = !c.ok || (m.paid && !m.paid.ok);
      return (
        <div className={`credit ${red ? "red" : ""}`}>
          <div className="ttl">
            <span>Intatto credit agent</span>
            <span style={{ fontWeight: 400, color: c.session === "Closed" ? "var(--red)" : "var(--amber)" }}>
              {c.session === "Closed" ? "Saturday" : c.session} · limit {c.limit}%
            </span>
          </div>
          {c.ok && (
            <div className="kv">
              <div>
                <span>Put up</span>
                <b>{c.deposit ? `${c.deposit} NVDAx` : "existing collateral"}</b>
              </div>
              <div>
                <span>Borrow</span>
                <b>{usd(c.borrow)}</b>
              </div>
              <div>
                <span>LTV after</span>
                <b>{c.ltvAfter.toFixed(0)}%</b>
              </div>
              <div>
                <span>Liquidates if NVIDIA falls</span>
                <b>{c.liqDrop.toFixed(0)}%</b>
              </div>
            </div>
          )}
          {!c.ok ? (
            <>
              <button className="pay no" disabled>
                Refused: {c.error}
              </button>
              <div className="note red">The contract refused this in a simulation. Nothing was signed.</div>
            </>
          ) : m.paid?.ok ? (
            <>
              <button className="pay done" disabled>
                ✓ Paid {usd(c.borrow)} with stock credit
              </button>
              <div className="tx" style={{ marginTop: 8 }}>
                {m.paid.steps?.map((s) => <div key={s}>{s}</div>)}
              </div>
              <div className="note">
                One atomic Solana transaction ·{" "}
                <a href={m.paid.url} target="_blank" rel="noreferrer">
                  view on explorer
                </a>
              </div>
            </>
          ) : m.paid && !m.paid.ok ? (
            <button className="pay no" disabled>
              Refused: {m.paid.error}
            </button>
          ) : (
            <button className="pay" onClick={() => onPay(m.quote)} disabled={busy}>
              {m.paying ? "Signing…" : `Pay ${usd(c.borrow)} with stock credit`}
            </button>
          )}
        </div>
      );
    }
  }
}
