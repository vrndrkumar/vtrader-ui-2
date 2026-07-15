import { Link } from 'react-router-dom'
import { BadgeChip, ConvictionStars, LifecycleStepper, RiskChip, WarningTagChip } from './components/Badges'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-5 sm:p-6 scroll-mt-4">
      <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  )
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-brand-200 dark:border-brand-800 pl-3">
      <div className="text-xs font-bold text-slate-900 dark:text-white">{name}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{children}</p>
    </div>
  )
}

const TOC = [
  ['what', 'What this platform is (and is not)'],
  ['scores', 'The three scores'],
  ['lifecycle', 'The opportunity lifecycle'],
  ['badges', 'Badges and warning tags'],
  ['conviction', 'Conviction stars'],
  ['ranks', 'Ranks and percentiles'],
  ['evidence', 'Reading the evidence'],
  ['risk', 'The risk panel'],
  ['history', 'Score history'],
  ['workflow', 'How to actually use it'],
  ['expectations', 'Honest expectations'],
  ['glossary', 'Glossary of terms'],
] as const

export default function GuidePage() {
  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/insight" className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline">← Universe</Link>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">How to read a Stock Insight report</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            A plain-language guide to every score, badge and term on this platform — written for a normal human,
            not a technical analyst. Ten minutes here and every report will make sense.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TOC.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                {label}
              </a>
            ))}
          </div>
        </div>

        <Section id="what" title="What this platform is (and is not)">
          <p>
            Stock Insight scans the whole stock universe and asks one question for every stock:
            <b className="text-slate-900 dark:text-white"> "does this stock deserve investigation because it may be early in a big move?"</b>
          </p>
          <p>
            Think of it as a research assistant that reads thousands of price charts overnight and hands you a short list
            with reasons. It looks for stocks that are being quietly accumulated <i>before</i> the crowd notices — the
            "hidden gems" — and clearly separates them from stocks the market has already discovered.
          </p>
          <p className="font-semibold text-slate-900 dark:text-white">
            It is NOT a tip service. It never tells you to buy or sell, gives no target prices, no stop losses, no entries.
            It ranks and explains. The decision — and the homework on the company itself — is always yours.
          </p>
        </Section>

        <Section id="scores" title="The three scores — three different questions">
          <p>Every stock gets three independent scores from 0 to 100. Each answers a different question:</p>
          <div className="space-y-3 mt-2">
            <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 p-3.5">
              <div className="text-xs font-bold text-violet-700 dark:text-violet-300">DISCOVERY — "Could this be early?"</div>
              <p className="text-xs mt-1">
                Looks for stocks building energy quietly: a strong past advance followed by a calm resting phase, volume drying
                up, and signs of quiet buying. High Discovery means the ingredients of a future move may be forming —
                <b> before</b> it is obvious. This is the score the platform is built around.
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3.5">
              <div className="text-xs font-bold text-brand-700 dark:text-brand-300">TRANSITION — "Is it waking up?"</div>
              <p className="text-xs mt-1">
                Looks for the moment a quiet or beaten-down stock starts turning: reclaiming its long-term average, the weekly
                trend flipping up, higher lows forming. High Transition means the change may be starting right now.
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3.5">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">MOMENTUM — "Is it already recognised?"</div>
              <p className="text-xs mt-1">
                Measures established strength: a confirmed weekly uptrend, price above its 200-day average, persistent demand.
                High Momentum means the market <b>already knows</b> about this stock. Not bad — just later-stage, with less
                of the "early" advantage.
              </p>
            </div>
          </div>
          <p>
            The key insight: <b className="text-slate-900 dark:text-white">a high Discovery score with a LOW Momentum score is the profile this
            platform hunts</b> — strong early evidence the market hasn't priced in yet. When Momentum is the highest score,
            you're looking at a stock everyone can already see.
          </p>
        </Section>

        <Section id="lifecycle" title="The opportunity lifecycle — how early are we?">
          <p>Every opportunity travels the same road:</p>
          <div className="my-3"><LifecycleStepper stage="discovery" earliness="Example: this stock is highlighted at the Discovery stage" /></div>
          <p>
            <b className="text-slate-900 dark:text-white">Discovery</b> — quiet, unnoticed, energy possibly building. Highest potential reward,
            highest uncertainty. → <b className="text-slate-900 dark:text-white">Transition</b> — the turn is happening; other investors are starting
            to participate. → <b className="text-slate-900 dark:text-white">Momentum</b> — fully recognised trend; the move is public knowledge.
          </p>
          <p>
            The highlighted step on each report tells you instantly where the stock sits on this road, and the line under it
            answers "how early are we?" in words.
          </p>
        </Section>

        <Section id="badges" title="Badges and warning tags">
          <p>The badge is the one-line classification, driven by whichever engine holds the strongest evidence:</p>
          <div className="space-y-2.5 mt-2">
            <div className="flex items-start gap-2.5"><BadgeChip badge="HIDDEN GEM CANDIDATE" /><span className="text-xs">Strong early evidence AND the market hasn't noticed (Momentum much weaker). The flagship badge — rare and worth investigating.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="EARLY DISCOVERY" /><span className="text-xs">Strong early evidence, though the market is partially aware already.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="QUIET ACCUMULATION" /><span className="text-xs">Volume has gone quiet while buying pressure quietly builds — possible smart-money absorption, not yet conclusive.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="TRANSITION STARTED" /><span className="text-xs">The turn is underway — weekly trend flipped or the 200-day average was just reclaimed.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="BUILDING STRENGTH" /><span className="text-xs">Recovery evidence accumulating, but the decisive turn signal hasn't fired yet.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="LEADERSHIP EMERGING" /><span className="text-xs">Graduating into a recognised leader — mid-to-late stage.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="MOMENTUM ESTABLISHED" /><span className="text-xs">A confirmed, publicly visible uptrend. Later-stage: the early advantage is gone.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="WATCHLIST" /><span className="text-xs">Some evidence, not enough conviction yet. Worth keeping an eye on.</span></div>
            <div className="flex items-start gap-2.5"><BadgeChip badge="QUIET" /><span className="text-xs">Nothing notable happening in price or volume right now.</span></div>
          </div>
          <p className="mt-3">Warning tags appear <i>alongside</i> any badge — an opportunity and a warning can coexist:</p>
          <div className="space-y-2.5 mt-1">
            <div className="flex items-start gap-2.5"><WarningTagChip tag="DISTRIBUTION RISK" /><span className="text-xs">High volume but money flow falling — possible selling into strength.</span></div>
            <div className="flex items-start gap-2.5"><WarningTagChip tag="WEAK STRUCTURE" /><span className="text-xs">Still making lower lows — the decline may not be finished ("falling knife").</span></div>
            <div className="flex items-start gap-2.5"><WarningTagChip tag="THIN LIQUIDITY" /><span className="text-xs">Very little daily trading value — hard to exit without moving the price.</span></div>
            <div className="flex items-start gap-2.5"><WarningTagChip tag="HIGH VOLATILITY" /><span className="text-xs">Big daily swings — expect deep, fast drawdowns if wrong.</span></div>
          </div>
        </Section>

        <Section id="conviction" title="Conviction stars — one glance, combined evidence">
          <div className="my-1"><ConvictionStars conviction={{ stars: 4, label: 'High' }} size="lg" /></div>
          <p>
            Conviction compresses everything into one 1-to-5 star rating: how strong is the best engine's evidence, how
            exceptional is this stock versus the whole market, and how contained is the risk. Five stars means the stock is
            simultaneously strong, rare and not wildly risky. It's a prioritisation aid — read the evidence before acting on it.
          </p>
        </Section>

        <Section id="ranks" title="Ranks and percentiles — is 62 a good score?">
          <p>
            A score alone is hard to judge. That's why every score comes with context, e.g.
            <b className="text-slate-900 dark:text-white"> "#5 of 1,200 in market · Top 0.4%"</b>. That line means: out of 1,200 analysed stocks,
            only 4 have a stronger Discovery score today. A 62 that ranks #5 in the market is exceptional; a 62 that ranks
            #400 is ordinary. Reports also show the rank within the stock's own sector — being #1 in Chemicals matters even
            when the whole sector is quiet.
          </p>
        </Section>

        <Section id="evidence" title="Reading the evidence — the ✓ and ⚠ lines">
          <p>Every claim the platform makes is backed by a visible evidence line. Three kinds:</p>
          <div className="space-y-2 mt-1">
            <Term name="✓ Green check + points (e.g. 'Prior strong advance +30')">
              Evidence that is PRESENT. The points show how much it contributes to the score — bigger points = historically
              more predictive. The grey text explains what was measured and why it matters.
            </Term>
            <Term name="⚠ Amber warning in an engine card (e.g. 'Weekly trend not up yet')">
              Evidence that is MISSING. Not necessarily bad — for an early-stage stock, missing confirmation is normal.
              These lines tell you what to watch for next.
            </Term>
            <Term name="Overall evidence vs engine-specific evidence">
              Signals shared by several engines (like volume drying up) are shown once under "Overall evidence". Each engine
              card then shows only what is unique to its own question — so you never read the same point twice.
            </Term>
          </div>
        </Section>

        <Section id="risk" title="The risk panel — deliberately separate">
          <div className="flex items-center gap-2"><RiskChip level="LOW" /><RiskChip level="MEDIUM" /><RiskChip level="HIGH" /></div>
          <p>
            Risk is never mixed into the opportunity scores, and it never disqualifies a stock. Why? Our research found that
            many of the biggest past winners were small, volatile and illiquid — exactly the stocks a "safety filter" would
            delete. So instead of hiding them, the platform shows you the danger honestly: volatility, liquidity, drawdown
            depth, structural weakness, market headwinds. A HIGH-risk hidden gem can be a legitimate research candidate —
            as long as you know what you're holding.
          </p>
        </Section>

        <Section id="history" title="Score history — improving or fading?">
          <p>
            Every analysis is stored, so each report shows how scores travelled: <b className="text-slate-900 dark:text-white">Discovery 42 → 55 → 68 → 81 ↑</b>.
            A rising Discovery line means the early evidence is strengthening — often more informative than any single
            snapshot. A fading line means the window may be closing (or the setup failed quietly). Badge changes across runs
            (upgrades/downgrades) appear on the universe dashboard.
          </p>
        </Section>

        <Section id="workflow" title="How to actually use it — a simple routine">
          <p><b className="text-slate-900 dark:text-white">1.</b> Run (or schedule) "Analyse Entire Universe" so the data is fresh.</p>
          <p><b className="text-slate-900 dark:text-white">2.</b> Start at the dashboard: Top Picks for the strongest combined cases, Top Hidden Gems for the earliest ones, New Discovery Signals and Biggest Improvements for what changed since last time.</p>
          <p><b className="text-slate-900 dark:text-white">3.</b> Open a report. Read the executive summary first — it's the whole story in five sentences. Check the lifecycle stage (how early?), conviction (how strong?), and rank (how rare?).</p>
          <p><b className="text-slate-900 dark:text-white">4.</b> Read the evidence and the missing items — the missing list is your personal watch-list of confirmations to wait for.</p>
          <p><b className="text-slate-900 dark:text-white">5.</b> Read the risk panel with equal seriousness. Then do the non-price homework this platform cannot do: the company's business, results, promoters, news.</p>
          <p><b className="text-slate-900 dark:text-white">6.</b> Re-check after the next analysis run: is your candidate's score history rising or fading?</p>
        </Section>

        <Section id="expectations" title="Honest expectations — read this twice">
          <p>
            In our validation on 2020–2026 history, roughly <b className="text-slate-900 dark:text-white">1 in 3</b> top-decile
            Discovery candidates went on to gain +50% within about six months — detected a median of ~7 months before the
            move. That is a genuinely strong hit rate for finding rare events early, and it also means
            <b className="text-slate-900 dark:text-white"> most candidates will NOT make a big move</b>. This tool improves the odds of looking at the
            right stocks; it does not predict. Past patterns may not repeat. Historical numbers are also flattered by
            survivorship (delisted failures are missing from the data). Fundamentals and news are not evaluated at all —
            never skip that homework.
          </p>
        </Section>

        <Section id="glossary" title="Glossary — every term on the report, in plain words">
          <div className="grid gap-3 sm:grid-cols-2">
            <Term name="Prior strong advance">The stock already rose 30%+ over the past ~6 months, then paused. Sounds counter-intuitive, but this is the single most predictive early signal we validated: strength that rests tends to continue. Stocks with no history of strength rarely lead.</Term>
            <Term name="Volume drying up">Recent daily volumes are well below normal (10-day average under 75% of the 50-day). Interpreted as sellers finishing — supply going quiet before demand can move price easily.</Term>
            <Term name="Quiet accumulation / OBV">OBV (On-Balance Volume) adds volume on up days and subtracts it on down days. OBV rising while price stands still suggests someone is steadily buying without chasing — an accumulation footprint.</Term>
            <Term name="Compression / volatility squeeze">The stock's daily range has contracted to its tightest levels in months (measured by Bollinger Band width) while price holds a base. Coiled-spring logic — but our research shows it only matters AFTER a prior advance.</Term>
            <Term name="Base">A sideways resting zone where price stays within ~8% of its 20-day average for weeks. The longer and calmer, the more supply changes hands.</Term>
            <Term name="Weekly trend / weekly turn">The big-picture direction (weekly closes vs their 20-week average). The TURN — the moment it flips from down to up — is early information; the established state is confirmation everyone can see.</Term>
            <Term name="200-day average (200-SMA) / reclaim">The classic long-term health line. Above it = long-term uptrend territory. RECLAIMING it after months below is the strongest recovery signal we validated (especially for beaten-down stocks).</Term>
            <Term name="Higher low">Each dip stops above the previous dip — sellers are losing power. The first building block of a trend change.</Term>
            <Term name="Change of character (CHOCH)">In a falling stock, price breaks above its last lower high for the first time — the earliest hint the downtrend's rhythm is broken.</Term>
            <Term name="Relative strength (RS) vs NIFTY">Is this stock beating the index? Improving RS means it's starting to outperform the market — leadership often shows here first.</Term>
            <Term name="52-week high distance ('under-followed territory')">How far below its one-year peak the stock trades. Our research found future big winners sat DEEPER below their highs than average stocks months before their moves — being forgotten is part of being early.</Term>
            <Term name="ATR / volatility">Average True Range — the typical daily price swing, shown as % of price. Above 4% means violent moves in both directions.</Term>
            <Term name="Liquidity / turnover">Average daily traded value in ₹ crore. Below ~₹2cr, entering and exiting meaningfully moves the price — the biggest practical risk with small hidden gems.</Term>
            <Term name="RSI">A 0–100 momentum thermometer. Mid-zone (45–65) = healthy; above 72 = hot (which, in strong trends, historically continued more often than reversed).</Term>
            <Term name="Market regime">Whether NIFTY itself is above its 200-day average. A falling market drags most stocks down regardless of their own merits.</Term>
            <Term name="Top decile / percentile">Being in the top 10% of all analysed stocks on a score. "Top 0.4%" = stronger than 99.6% of the universe today.</Term>
          </div>
        </Section>

        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 px-1 pb-6">
          Educational reference for the Stock Insight research platform. Nothing on this page or in any report is investment
          advice or a recommendation to buy or sell any security. Analysis uses price/volume data only; verify fundamentals
          and news independently and consult a registered investment adviser before making decisions.
        </p>
      </div>
    </div>
  )
}
