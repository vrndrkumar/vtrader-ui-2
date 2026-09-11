// ── Confluence · Engine Documentation (admin-only) ────────────────────────────
// A living docs hub for the market-data platform. Left rail = doc index grouped
// by category; main = the selected article. Add future service docs to the DOCS
// registry below and they appear in the index automatically.

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'

// ── Theme-aware primitives ────────────────────────────────────────────────────

function Badge({ kind }: { kind: 'live' | 'timer' | 'manual' }) {
  const map = {
    live:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    timer:  'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    manual: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  } as const
  const label = { live: 'Live service', timer: 'Timer', manual: 'On-demand' } as const
  return (
    <span className={clsx('text-[10px] font-bold uppercase tracking-wide px-2 py-[3px] rounded-full', map[kind])}>
      {label[kind]}
    </span>
  )
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.06] px-2 py-[2px] rounded-md">
      {children}
    </span>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[12.5px] px-1.5 py-[1px] rounded bg-slate-100 dark:bg-white/[0.07] text-slate-800 dark:text-slate-200">{children}</code>
}

function Card({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:shadow-none">
      {children}
    </section>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1200)
    })
  }
  // simple highlighter: comments (#) muted, everything else default
  const lines = code.replace(/\n$/, '').split('\n')
  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-slate-800 bg-[#0b1220]">
      <button onClick={copy}
        className="absolute top-2 right-2 z-10 text-[11px] px-2.5 py-1 rounded-md border border-white/15 bg-white/[0.08] text-slate-300 hover:bg-white/[0.16] hover:text-white transition-colors">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.7] font-mono text-slate-200">
        {lines.map((ln, i) => (
          <div key={i} className={clsx(ln.trimStart().startsWith('#') && 'text-slate-500')}>{ln || ' '}</div>
        ))}
      </pre>
    </div>
  )
}

function Callout({ tone, title, children }: { tone: 'tip' | 'warn' | 'err' | 'info'; title: string; children: React.ReactNode }) {
  const map = {
    tip:  'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/[0.07]',
    warn: 'border-amber-400 bg-amber-50 dark:bg-amber-500/[0.07]',
    err:  'border-red-400 bg-red-50 dark:bg-red-500/[0.07]',
    info: 'border-blue-400 bg-blue-50 dark:bg-blue-500/[0.07]',
  } as const
  return (
    <div className={clsx('my-3.5 rounded-lg border-l-[3px] px-4 py-3 text-[13.5px] text-slate-700 dark:text-slate-300', map[tone])}>
      <p className="font-semibold text-slate-900 dark:text-white mb-0.5">{title}</p>
      <div className="[&_a]:text-brand-700 dark:[&_a]:text-brand-400 [&_a:hover]:underline">{children}</div>
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/[0.07]">
      <table className="w-full text-[13.5px] border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-white/[0.03]">
            {head.map((h, i) => (
              <th key={i} className="text-left px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.07]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-3.5 py-2.5 align-top text-slate-700 dark:text-slate-300">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-6 text-[22px] font-bold tracking-tight text-slate-900 dark:text-white mt-11 mb-2 first:mt-2">{children}</h2>
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15.5px] font-semibold text-slate-900 dark:text-white mt-5 mb-1.5">{children}</h3>
}
function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-500 dark:text-slate-400 max-w-3xl mb-2">{children}</p>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="my-2.5 text-slate-700 dark:text-slate-300 leading-[1.65]">{children}</p>
}
function SvcHead({ title, unit, kind }: { title: string; unit: string; kind: 'live' | 'timer' | 'manual' }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-1">
      <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white m-0">{title}</h3>
      <Unit>{unit}</Unit><Badge kind={kind} />
    </div>
  )
}
function Flow({ steps }: { steps: [string, string][] }) {
  return (
    <div className="flex items-stretch flex-wrap gap-0 my-4">
      {steps.map(([a, b], i) => (
        <div key={i} className="flex items-center">
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2.5 text-center min-w-[118px]">
            <b className="block text-[13px] text-slate-900 dark:text-white">{a}</b>
            <small className="text-[11px] text-slate-500 dark:text-slate-400">{b}</small>
          </div>
          {i < steps.length - 1 && <span className="px-1.5 text-brand-500 font-extrabold self-center">→</span>}
        </div>
      ))}
    </div>
  )
}

// ── The Candle Engine document ────────────────────────────────────────────────

const ENGINE_TOC = [
  ['overview', 'Overview'],
  ['architecture', 'Architecture & data flow'],
  ['data-model', 'Data model & tables'],
  ['symbols', 'Symbol conventions'],
  ['svc-engine', 'Candle Engine'],
  ['svc-api', 'Candle API'],
  ['svc-confirm', 'Confirm Service'],
  ['svc-chain', 'Chain Service'],
  ['jobs', 'Scheduled jobs'],
  ['job-eod-chain', 'EOD Full Chain'],
  ['breeze', 'Breeze gap-fill'],
  ['api-ref', 'API reference'],
  ['troubleshoot', 'Troubleshooting'],
  ['cheatsheet', 'Ops cheat-sheet'],
] as const

function CandleEngineDoc() {
  return (
    <div className="space-y-1">
      {/* Overview */}
      <H2 id="overview">Overview</H2>
      <Lead>The market-data platform turns live broker ticks into clean, minute-aligned candles and
        option-chain snapshots, stores them in TimescaleDB, and serves them over an HTTP API. It is
        <b> symbol-agnostic</b> — indices, options and equities flow through one pipeline into the same
        tables, so historical and live data are queried identically.</Lead>
      <Table
        head={['Kind', 'What it is', 'Examples']}
        rows={[
          [<Badge kind="live" />, 'Long-running systemd daemon, auto-restarts on crash / boot.', 'Engine, API, Confirm, Chain'],
          [<Badge kind="timer" />, 'Oneshot job fired by a systemd timer at a fixed time.', 'EOD finalize, EOD backfill, Stocks EOD, EOD full chain'],
          [<Badge kind="manual" />, 'Script a developer runs by hand to backfill or repair data.', 'Breeze backfill, Fyers backfill, rollups'],
        ]}
      />
      <Callout tone="info" title="Timezone convention (read this first)">
        Everything is stored as <Mono>timestamptz</Mono> in UTC. A candle's <Mono>bucket_start</Mono> is
        the minute-aligned instant it opened. Indian market <b>09:15 IST = 03:45Z</b>. The API speaks IST
        for humans; the DB thinks in UTC. When unsure, compare with <Mono>bucket_start AT TIME ZONE 'Asia/Kolkata'</Mono>.
      </Callout>

      {/* Architecture */}
      <H2 id="architecture">Architecture &amp; data flow</H2>
      <Lead>Live ticks arrive on Redis, are normalized and projected into 1-minute candles, and written
        to TimescaleDB. Higher timeframes are pre-aggregated. End-of-day and backfill jobs correct and
        complete the data from broker history APIs.</Lead>
      <Flow steps={[['Broker feed', 'Fyers → Redis'], ['Engine', 'normalize + project'], ['candles_1m', 'TimescaleDB'], ['Rollups', '5m…1d tables'], ['API', ':8080 HTTP']]} />
      <P>Two accuracy layers sit on top of the live feed. The <b>Confirm</b> and <b>EOD Backfill</b> jobs
        replace the noisy live-built bars with exact 1-minute OHLC+OI from the broker's history API after
        close. The <b>Chain</b> service and <b>EOD Full-Chain</b> job add per-minute option greeks / OI /
        bid-ask that the raw tick feed does not carry.</P>
      <Callout tone="tip" title="Why two sources (Fyers + ICICI Breeze)?">
        Fyers powers the live pipeline but does not retain deep option history. ICICI Breeze is an
        independent broker used purely to backfill 1–2 years of historical option data into the same
        tables. Being separate rate-limit buckets, they can run in parallel.
      </Callout>

      {/* Data model */}
      <H2 id="data-model">Data model &amp; tables</H2>
      <Table
        head={['Table', 'Holds', 'Written by']}
        rows={[
          [<Mono>candles_1m</Mono>, '1-minute OHLCV + OI for every instrument (index, option, stock). Hypertable.', 'Engine, EOD backfill, EOD chain, Breeze'],
          [<Mono>candles_5m … 1d</Mono>, 'Pre-aggregated higher timeframes, refreshed from 1m.', 'Engine rollup cycle, rollup scripts'],
          [<Mono>option_chain_1m</Mono>, 'Per-minute option analytics: ltp, oi, volume, delta/gamma/theta/vega, iv.', 'Chain service, EOD chain, Breeze'],
          [<Mono>option_chain_underlying_1m</Mono>, 'Per-minute underlying spot snapshot for the chain.', 'Chain service'],
          [<Mono>instruments</Mono>, 'Registry mapping internal symbol → id / underlying / expiry / strike / type.', 'All writers'],
          [<Mono>index_mstr / stock_mstr</Mono>, 'Master lists (MySQL) — index & equity metadata.', 'Master loaders'],
        ]}
      />
      <Callout tone="info" title="One shape for live & history">
        Because the Breeze loader and the nightly Fyers job both write <Mono>candles_1m</Mono> +
        <Mono>option_chain_1m</Mono> in the exact same format, the Option Simulator serves any date —
        2025 history or today's live — through one identical query path.
      </Callout>

      {/* Symbols */}
      <H2 id="symbols">Symbol conventions</H2>
      <Lead>Internal symbols are broker-independent. Broker formats are only used at the API boundary when
        calling Fyers or Breeze.</Lead>
      <Table
        head={['Context', 'Format', 'Example']}
        rows={[
          ['Internal index', <Mono>INDEX_&lt;NAME&gt;</Mono>, <Mono>INDEX_NIFTY</Mono>],
          ['Internal option', <Mono>&lt;UND&gt;_&lt;ddMONyy&gt;_&lt;CE|PE&gt;_&lt;strike&gt;</Mono>, <Mono>NIFTY_08SEP26_CE_25000</Mono>],
          ['Fyers monthly', <Mono>NSE:&lt;UND&gt;&lt;yy&gt;&lt;MON&gt;&lt;strike&gt;&lt;CE|PE&gt;</Mono>, <Mono>NSE:NIFTY26SEP25000CE</Mono>],
          ['Fyers weekly', <Mono>NSE:&lt;UND&gt;&lt;yy&gt;&lt;m&gt;&lt;dd&gt;&lt;strike&gt;&lt;CE|PE&gt;</Mono>, <Mono>NSE:NIFTY2690825000CE</Mono>],
        ]}
      />
      <P>Weekly month code: <Mono>1–9</Mono> for Jan–Sep, then <Mono>O / N / D</Mono> for Oct / Nov / Dec.
        SENSEX / BANKEX options use the <Mono>BSE:</Mono> prefix.</P>

      {/* ── Live services ── */}
      <H2 id="svc-engine">Live services</H2>
      <Lead>Long-running daemons; each auto-restarts on crash and starts on boot. Inspect with
        <Mono>systemctl status &lt;unit&gt;</Mono> and <Mono>journalctl -u &lt;unit&gt; -f</Mono>.</Lead>

      <div className="space-y-4 mt-3">
        <Card>
          <SvcHead title="Candle Engine" unit="market-data-engine" kind="live" />
          <P><b>What it does.</b> The heart of the system. Subscribes to the live Redis feed
            (<Mono>INDEX_TICK_*</Mono>, <Mono>OPTION_CHAIN_*</Mono>), normalizes every tick (fixes bad
            timestamps, drops out-of-session ticks), projects them into 1-minute candles, writes
            <Mono>candles_1m</Mono>, and on a slow cadence refreshes the rollup tables (5m…1d) for the
            current session.</P>
          <H3>Health check — example</H3>
          <CodeBlock code={`# is it up? then watch it build candles live
systemctl status market-data-engine --no-pager
journalctl -u market-data-engine -f

# did the current minute land? (last 5 NIFTY 1m bars, IST)
psql -h 127.0.0.1 -U vtrader -d vtrader -c "SELECT bucket_start AT TIME ZONE 'Asia/Kolkata' ist,
  open,high,low,close,volume FROM candles_1m c JOIN instruments i USING(instrument_id)
  WHERE i.symbol='INDEX_NIFTY' ORDER BY bucket_start DESC LIMIT 5;"`} />
          <Callout tone="warn" title="Troubleshoot — candles stopped appearing">
            1) Feed alive? <Mono>redis-cli -n 0 PUBSUB CHANNELS 'INDEX_TICK_*'</Mono>. 2) Weekday inside
            09:15–15:40? Outside session the engine writes nothing by design. 3) Check the log for a
            <Mono>bad timestamp</Mono> warning — a poison tick (e.g. a µs-epoch symbol) once stalled a
            whole batch; the normalizer now quarantines it and logs the symbol.
          </Callout>
        </Card>

        <Card id="svc-api">
          <SvcHead title="Candle API" unit="market-data-api" kind="live" />
          <P><b>What it does.</b> Serves candles, option chains, quotes, expiries and indicators over HTTP
            on port <Mono>8080</Mono>. Reads from the pre-aggregated rollup tables where possible so higher
            timeframes don't re-aggregate 1m rows per request. This is the API the Option Simulator and the
            rest of the platform call.</P>
          <H3>Example — fetch a candle &amp; an option chain</H3>
          <CodeBlock code={`curl localhost:8080/health

# 1m NIFTY candles for a range (times are IST)
curl "localhost:8080/data/candle?symbol=INDEX_NIFTY&tf=1m&from=2026-09-02 09:15&to=2026-09-02 10:35"

# full option chain (all strikes, ATM from spot) at a minute
curl "localhost:8080/data/option-chain?underlying=NIFTY&expiry=2026-09-08&at=2026-09-02 10:00"`} />
          <Callout tone="warn" title="Troubleshoot — quotes/candle empty or 500">
            Empty usually means the requested minute has no data (holiday, pre-open, or the symbol never
            traded). A 500 on <Mono>/data/quotes</Mono> was historically a Fyers symbol-resolution issue —
            the API resolves via the Redis <Mono>MASTER_*</Mono> keys, falling back to an <Mono>NSE:</Mono>
            prefix. Confirm the symbol exists in <Mono>instruments</Mono> and check the api log.
          </Callout>
        </Card>

        <Card id="svc-confirm">
          <SvcHead title="Confirm Service" unit="market-data-confirm" kind="live" />
          <P><b>What it does.</b> Live bars come from a fast, occasionally-noisy tick stream. For symbols
            that actually traded, the confirm service pulls the <b>exact</b> 1-minute OHLC from Fyers and
            overwrites the live-built bar, so the stored close/volume are broker-accurate. It is aware of
            the SEBI Closing Auction Session (CAS) window and only runs on trading days.</P>
          <Callout tone="info" title="Why it matters">
            Without it, a thin symbol's last live tick could misstate the true 1-minute close. With it,
            live speed and broker accuracy both hold.
          </Callout>
        </Card>

        <Card id="svc-chain">
          <SvcHead title="Chain Service" unit="market-data-chain" kind="live" />
          <P><b>What it does.</b> Every minute during the session it snapshots the live option chain
            (greeks, OI, bid/ask) via Fyers <Mono>options-chain-v3</Mono> for NIFTY, BANKNIFTY and SENSEX,
            writing <Mono>option_chain_1m</Mono> + <Mono>option_chain_underlying_1m</Mono>. It runs on a
            <b> separate Fyers account (user 33)</b> so its polling doesn't eat the main pipeline's rate limit.</P>
          <Callout tone="warn" title="Known limitation — nearest expiry only, live">
            The live Fyers chain reliably returns only the <b>nearest</b> expiry; the <Mono>expiry</Mono>
            parameter comes back empty for further-out expiries. The nightly EOD Full-Chain job fills every
            other expiry after close. Note <b>bid/ask is live-only</b> — no history source provides it, so it
            can never be backfilled.
          </Callout>
          <Callout tone="err" title="Troubleshoot — chain service stopped / rate-limited">
            If Fyers rate-limits account 33 the service can exit. It carries crash guards and
            <Mono>StartLimitIntervalSec=0</Mono> so systemd keeps restarting it. If stopped deliberately for
            a rate-limit issue, restart with <Mono>systemctl start market-data-chain</Mono> once the window clears.
          </Callout>
        </Card>
      </div>

      {/* ── Scheduled jobs ── */}
      <H2 id="jobs">Scheduled jobs (systemd timers)</H2>
      <Lead>Oneshot jobs that fire after close, staggered so the two Fyers-based jobs never share the rate
        limit at the same instant. <Mono>Persistent=false</Mono> — a missed run is not auto-replayed; the
        gap-aware backfill closes any hole on the next run.</Lead>
      <Table
        head={['Time (IST, Mon–Fri)', 'Unit', 'Job']}
        rows={[
          [<b>15:45</b>, <Mono>market-data-eod</Mono>, 'Finalize today’s live bars + verify'],
          [<b>16:00</b>, <Mono>market-data-eod-backfill</Mono>, 'Exact index+option 1m from Fyers (close, volume, OI)'],
          [<b>16:30</b>, <Mono>market-data-stocks-eod</Mono>, 'Backfill today’s stock 15m + refresh stock rollups'],
          [<b>17:00</b>, <Mono>market-data-eod-chain</Mono>, 'Full option chain, all expiries, computed greeks'],
        ]}
      />
      <div id="job-eod-chain" className="scroll-mt-6 mt-4">
        <Card>
          <SvcHead title="EOD Full Option Chain + Greeks" unit="market-data-eod-chain · 17:00" kind="timer" />
          <P><b>What it does.</b> The nightly completeness job. Enumerates <b>all</b> relevant expiries
            directly from NSE/BSE (broker-independent), takes an ATM strike band around the day's index
            range, pulls per-minute OHLC+OI from Fyers <Mono>/data/history</Mono> for every contract,
            computes Black–Scholes greeks (IV solved from the option price using the index spot), and upserts
            <Mono>candles_1m</Mono> + <Mono>instruments</Mono> + <Mono>option_chain_1m</Mono>. It closes the
            live "nearest-expiry-only" gap so every expiry has full per-minute greeks.</P>
          <H3>Run &amp; verify — example</H3>
          <CodeBlock code={`# manual run for one day (default date = today)
node scripts/eod_chain.js --date 2026-09-02 --underlyings NIFTY --band 3

# verify all expiries got computed greeks (not just the nearest)
psql -h 127.0.0.1 -U vtrader -d vtrader -c "SELECT i.expiry,
  count(DISTINCT i.instrument_id) legs, count(oc.iv) with_greeks
  FROM candles_1m c JOIN instruments i USING(instrument_id)
  LEFT JOIN option_chain_1m oc ON oc.instrument_id=c.instrument_id AND oc.bucket_start=c.bucket_start
  WHERE i.underlying='NIFTY' AND i.instrument_type='OPTION'
    AND (c.bucket_start AT TIME ZONE 'Asia/Kolkata')::date='2026-09-02'
  GROUP BY 1 ORDER BY 1;"`} />
          <Callout tone="tip" title="Expected result">
            Multiple expiry rows, each with <Mono>with_greeks &gt; 0</Mono>. Production runs
            <Mono>--band 20</Mono> (full ±20-strike chain) across NIFTY / BANKNIFTY / SENSEX in ~10–15 min.
          </Callout>
        </Card>
      </div>

      {/* ── Breeze ── */}
      <H2 id="breeze">On-demand — Breeze backfill &amp; gap-fill</H2>
      <Card>
        <SvcHead title="Breeze Historical Backfill" unit="scripts/breeze_backfill.js" kind="manual" />
        <P><b>What it does.</b> Loads historical option data (1–2 years) from ICICI Breeze — an independent
          broker — into the same <Mono>candles_1m</Mono> + <Mono>option_chain_1m</Mono> tables, computing
          greeks locally (Breeze gives OHLC+OI only). It doubles as a <b>general-purpose gap-filler</b>: give
          it any date range and it fills only what's missing, never duplicating (idempotent
          <Mono>ON CONFLICT</Mono> upserts).</P>
        <H3>Modes</H3>
        <Table
          head={['Flag', 'Behaviour', 'Use for']}
          rows={[
            [<Mono>--mode gap</Mono>, 'Per contract, fetch only the trading days missing from the range. Seeds spot from the DB, so it never re-hits Breeze for data it already has.', 'Patch any hole, any range — safe to re-run'],
            [<Mono>--mode contract</Mono>, 'Skip a contract entirely if it has any data in its window.', 'Fast resume of a fresh sequential deep backfill'],
            [<Mono>--mode force</Mono>, 'Re-fetch and overwrite the whole range (= --no-skip).', 'Repair suspected-bad data'],
          ]}
        />
        <H3>Examples</H3>
        <CodeBlock code={`# fill any gaps for all three underlyings across a range (default gap mode)
node scripts/breeze_backfill.js --from 2026-08-01 --to 2026-08-31

# top up everything up to today that live/EOD jobs haven't covered
node scripts/breeze_backfill.js --from 2025-01-01 --to $(date +%F)

# one index, small strike band, single test
node scripts/breeze_backfill.js --from 2026-08-01 --to 2026-08-31 --underlyings NIFTY --band 10`} />
        <P>Other flags: <Mono>--band</Mono> (strikes each side of ATM, default 20), <Mono>--r</Mono>
          (risk-free rate 0.065), <Mono>--q</Mono> (dividend yield 0), <Mono>--chunk-days</Mono>,
          <Mono>--gap-ms</Mono> (Breeze pacing), <Mono>--dry-run</Mono>.</P>
        <Callout tone="err" title='Troubleshoot — "BREEZE LOGIN FAILED / session expired"'>
          The ICICI Breeze session token is browser-issued and expires daily. Log in, copy a fresh token,
          set <Mono>BREEZE_SESSION_TOKEN</Mono> in <Mono>.env</Mono>, and re-run — gap mode resumes exactly
          where it stopped, no duplicates.
        </Callout>
      </Card>

      {/* ── API reference ── */}
      <H2 id="api-ref">API reference</H2>
      <Lead>Base URL <Mono>http://&lt;host&gt;:8080</Mono>. Times are IST unless noted.</Lead>
      <Table
        head={['Endpoint', 'Purpose']}
        rows={[
          [<Mono>GET /health</Mono>, 'Liveness probe.'],
          [<Mono>GET /data/candle</Mono>, 'OHLCV for a symbol & timeframe over a range (inclusive to).'],
          [<Mono>GET /data/option-chain</Mono>, 'Full strike ladder for an underlying/expiry at a minute; ATM from spot.'],
          [<Mono>GET /data/expiries</Mono>, 'Expiries available in the stored data for an underlying.'],
          [<Mono>GET /data/index-expiries</Mono>, 'Live expiry calendar direct from NSE/BSE (current/next month, quarterly, yearly).'],
          [<Mono>GET /data/quotes</Mono>, 'Latest quote for a symbol.'],
          [<Mono>GET /data/indicator</Mono>, 'Computed technical indicator series.'],
          [<Mono>GET /data/search · /symbols</Mono>, 'Symbol search / listing.'],
          [<Mono>POST /fill · /fill/:id · /fill/jobs</Mono>, 'On-demand fill jobs: submit, track, per-symbol report.'],
        ]}
      />

      {/* ── Troubleshooting ── */}
      <H2 id="troubleshoot">Troubleshooting runbook</H2>
      <Lead>Symptom → likely cause → fix. Start every investigation with the service status and last log
        lines, then confirm against the DB.</Lead>

      <H3>1 · A specific minute / day is missing from the option chain</H3>
      <P><b>Cause.</b> The live feed only carries the nearest expiries, and a job may have missed a run.
        <b> Fix.</b> Fill just that window with the gap-filler — it fetches only the missing days:</P>
      <CodeBlock code={`node scripts/breeze_backfill.js --from 2026-08-18 --to 2026-08-18 --underlyings NIFTY
# or, for recent dates Fyers still retains, run the nightly job for one day:
node scripts/eod_chain.js --date 2026-08-18`} />
      <P>Rule of thumb: <b>Breeze</b> for 2025 / older; <b>eod_chain</b> for recent months (faster, auto-token).</P>

      <H3>2 · Greeks are null but ltp/oi are present</H3>
      <P><b>Cause.</b> Greeks need the underlying spot at that minute; if the INDEX candle was absent, IV
        can't be solved. <b>Fix.</b> Ensure the index series exists for the day (loaders seed spot from
        <Mono>candles_1m INDEX_*</Mono>, falling back to the INDEX candle), then re-run the fill for that
        window — greeks recompute where spot is now available.</P>

      <H3>3 · A live service is dead and won't come back</H3>
      <CodeBlock code={`systemctl status market-data-chain --no-pager
journalctl -u market-data-chain -n 80 --no-pager
systemctl restart market-data-chain`} />

      <H3>4 · Volumes look inflated (~hundreds× too big)</H3>
      <P><b>Cause.</b> Historical bug where out-of-order cumulative-volume snapshots were treated as session
        resets. <b>Fix.</b> The projector now resets to <Mono>0</Mono> instead of carrying the cumulative
        value; on old data, re-run the EOD backfill for those days to overwrite with exact Fyers volume.</P>

      <H3>5 · Whole write batch stalls / "time zone displacement out of range"</H3>
      <P><b>Cause.</b> A poison tick with a microsecond/nanosecond epoch (e.g. a crypto symbol sending
        16-digit timestamps) parsed to a year far in the future. <b>Fix.</b> The normalizer's
        <Mono>toEpochMs()</Mono> normalizes and range-guards timestamps and the writer filters insane
        values; the offending symbol is logged.</P>

      <H3>6 · DB "Connection terminated due to connection timeout" after a server move</H3>
      <P><b>Cause.</b> A service still holding the old <Mono>PGHOST</Mono>. <b>Fix.</b> Update
        <Mono>.env</Mono> (<Mono>PGHOST=127.0.0.1</Mono>) and <b>restart the services</b> so they pick it up
        — a failed migration must not abort the deploy before the restart step.</P>

      <H3>7 · Deploy fails on "must be owner of table …"</H3>
      <P><b>Cause.</b> Migration DDL re-running as a non-owner role. <b>Fix.</b> Deploy with
        <Mono>SKIP_MIGRATE=1</Mono> (default) when the schema already exists; grant table ownership to
        <Mono>vtrader</Mono> only when new SQL genuinely needs applying.</P>

      {/* ── Cheat sheet ── */}
      <H2 id="cheatsheet">Ops cheat-sheet</H2>
      <CodeBlock code={`# --- service control ---
systemctl status  market-data-engine market-data-api market-data-confirm market-data-chain --no-pager
systemctl restart market-data-engine
journalctl -u market-data-engine -f          # live logs

# --- timers (scheduled jobs) ---
systemctl list-timers 'market-data-*' --all      # when does each next fire?
systemctl start market-data-eod-chain.service    # run a job now

# --- deploy (from your Mac) ---
./deploy_prod.sh                                # rsync + install.sh (SKIP_MIGRATE=1 by default)

# --- data checks ---
curl localhost:8080/health
psql -h 127.0.0.1 -U vtrader -d vtrader          # then query candles_1m / option_chain_1m`} />
    </div>
  )
}

// ── Doc registry (add future service docs here) ───────────────────────────────

interface DocDef {
  id: string
  category: string
  title: string
  subtitle: string
  status: 'ready' | 'soon'
  toc?: readonly (readonly [string, string])[]
  Body?: () => JSX.Element
}

const DOCS: DocDef[] = [
  { id: 'candle-engine', category: 'Data', title: 'Candle Engine — Services & Runbook',
    subtitle: 'Live engine, option-chain capture, EOD jobs and backfill — with troubleshooting.',
    status: 'ready', toc: ENGINE_TOC, Body: CandleEngineDoc },
  // Add future service docs here, e.g.:
  // { id: 'signal-generator', category: 'Trading', title: 'Signal Generator',
  //   subtitle: '…', status: 'ready', toc: SIGNAL_TOC, Body: SignalGeneratorDoc },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeId, setActiveId] = useState('candle-engine')
  const active = useMemo(() => DOCS.find((d) => d.id === activeId) ?? DOCS[0], [activeId])
  const categories = useMemo(() => {
    const map = new Map<string, DocDef[]>()
    for (const d of DOCS) { const a = map.get(d.category) ?? []; a.push(d); map.set(d.category, a) }
    return [...map.entries()]
  }, [])

  return (
    <div className="h-full min-h-0 flex bg-slate-50 dark:bg-surface-dark">
      {/* Doc index */}
      <aside className="hidden md:flex flex-col w-[248px] shrink-0 border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0B1020] overflow-y-auto">
        <div className="px-4 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-400">Confluence</p>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">Engine documentation</p>
        </div>
        <nav className="p-3 space-y-4">
          {categories.map(([cat, docs]) => (
            <div key={cat}>
              <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-600">{cat}</p>
              <div className="space-y-0.5">
                {docs.map((d) => {
                  const on = d.id === activeId
                  const disabled = d.status === 'soon'
                  return (
                    <button key={d.id} disabled={disabled}
                      onClick={() => !disabled && setActiveId(d.id)}
                      className={clsx(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-colors flex items-center gap-2',
                        disabled && 'cursor-not-allowed text-slate-400 dark:text-slate-600',
                        !disabled && on && 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-semibold',
                        !disabled && !on && 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]',
                      )}>
                      <span className="flex-1 truncate">{d.status === 'ready' ? d.title.split(' — ')[0] : d.title}</span>
                      {disabled && <span className="text-[9px] font-bold tracking-wider text-amber-500/70 border border-amber-400/25 rounded-full px-1.5 py-px">SOON</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Article */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#243244] text-white px-6 md:px-10 py-9">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.28), transparent 62%)' }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-400">System · Market Data</p>
          <h1 className="text-[28px] md:text-[30px] font-extrabold tracking-tight mt-1.5">{active.title}</h1>
          <p className="text-slate-300 max-w-3xl mt-2">{active.subtitle}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {['Host · srv1888766 (200.141.15.69)', 'App · /home/vtrader/market-data', 'Store · TimescaleDB', 'Runtime · Node 20+ · systemd'].map((m) => (
              <span key={m} className="text-[12px] rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-slate-200">{m}</span>
            ))}
          </div>
        </div>

        {/* Content + on-this-page */}
        <div className="flex max-w-[1180px] mx-auto">
          <article className="flex-1 min-w-0 px-6 md:px-10 py-8">
            {active.Body ? <active.Body /> : (
              <div className="py-20 text-center text-slate-400 dark:text-slate-600">
                <p className="text-[15px]">Documentation for this service is coming soon.</p>
              </div>
            )}
            <div className="mt-12 pt-5 border-t border-slate-200 dark:border-white/[0.07] flex flex-wrap justify-between gap-2 text-[12.5px] text-slate-400 dark:text-slate-600">
              <span>VTrader · Market-Data Platform — Candle Engine documentation</span>
              <span>Living document · services added as the platform grows</span>
            </div>
          </article>

          {active.toc && (
            <nav className="hidden xl:block w-[210px] shrink-0 py-8 pr-6">
              <div className="sticky top-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-600 mb-2 px-2">On this page</p>
                <div className="space-y-0.5">
                  {active.toc.map(([id, label]) => (
                    <a key={id} href={`#${id}`}
                      className="block px-2 py-1 rounded text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors">
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </nav>
          )}
        </div>
      </main>
    </div>
  )
}
