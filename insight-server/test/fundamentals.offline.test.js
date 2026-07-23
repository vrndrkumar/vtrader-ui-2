// Offline test: fundamentals mapping + outlook derivation (fixture, no network)
// + the ISOLATION guarantee: engine modules must not reference fundamentals.
import assert from 'node:assert'
import fs from 'node:fs'
import { mapFundamentals, deriveOutlook, toYahooSymbols } from '../src/fundamentals.js'

// symbol mapping
assert.deepEqual(toYahooSymbols('SBIN-EQ'), ['SBIN.NS', 'SBIN.BO'], 'strips -EQ, adds .NS/.BO')
assert.deepEqual(toYahooSymbols('MTARTECH-BE'), ['MTARTECH.NS', 'MTARTECH.BO'], 'strips -BE')
assert.deepEqual(toYahooSymbols('NIFTY'), ['NIFTY.NS', 'NIFTY.BO'], 'no suffix passthrough')

// fixture resembling yahoo quoteSummary output (values chosen to hit branches)
const fixture = {
  assetProfile: { sector: 'Industrials', industry: 'Textiles', country: 'India', fullTimeEmployees: 2200 },
  summaryDetail: {
    trailingPE: 12.4, forwardPE: 10.1, priceToSalesTrailing12Months: 1.4,
    dividendYield: 0.024, dividendRate: 18, payoutRatio: 0.28, exDividendDate: '2026-06-11T00:00:00.000Z',
    fiftyTwoWeekHigh: 1450, fiftyTwoWeekLow: 720, beta: 0.9, averageVolume: 182000, marketCap: 8.4e10,
  },
  defaultKeyStatistics: {
    pegRatio: 0.8, priceToBook: 2.1, enterpriseToEbitda: 8.3, trailingEps: 61.2,
    enterpriseValue: 8.9e10, sharesOutstanding: 3.0e7, floatShares: 1.6e7,
    heldPercentInsiders: 0.62, heldPercentInstitutions: 0.11, bookValue: 410,
  },
  financialData: {
    returnOnEquity: 0.21, returnOnAssets: 0.11, grossMargins: 0.42, operatingMargins: 0.16, profitMargins: 0.12,
    debtToEquity: 32, currentRatio: 2.1, quickRatio: 1.4, totalCashPerShare: 55,
    totalCash: 1.6e9, totalDebt: 9e8, revenueGrowth: 0.24, earningsGrowth: 0.31,
    freeCashflow: 1.1e9, operatingCashflow: 1.5e9,
  },
  price: { longName: 'Test Industries Ltd', exchangeName: 'NSI', currency: 'INR', marketCap: 8.4e10 },
  calendarEvents: {},
}

const mapped = mapFundamentals(fixture, 'TEST.NS')
assert.equal(mapped.sections.length, 8, 'eight display sections')
const flat = mapped.sections.flatMap((s) => s.rows)
const get = (label) => flat.find((r) => r.label === label)?.value
assert.equal(get('P/E (trailing)'), '12.40×', 'PE formatted')
assert.equal(get('ROE'), '21.0%', 'ROE % from fraction')
assert.equal(get('Debt / Equity'), '0.32×', 'D/E percent→ratio')
assert.equal(get('Market Cap'), '₹8,400 cr', 'market cap in crore')
assert.equal(get('Insider Ownership'), '62.0%', 'insider %')
assert.equal(get('ROIC'), 'N/A', 'unavailable metric → N/A')
assert.equal(get('Interest Coverage'), 'N/A', 'unavailable metric → N/A')
assert.equal(get('Ex-Dividend Date'), '2026-06-11', 'date formatted')

// outlook derivation — strong fixture
const strongOutlook = mapped.outlook
const level = (label) => strongOutlook.find((o) => o.label === label)?.level
assert.equal(level('Financial Strength'), 'Strong')
assert.equal(level('Profitability'), 'Excellent')
assert.equal(level('Valuation'), 'Undervalued')
assert.equal(level('Growth'), 'High')
assert.equal(level('Dividend'), 'Attractive')
assert.equal(level('Overall Fundamental Outlook'), 'Positive')

// outlook — weak/missing data
const weak = deriveOutlook({ trailingPE: 65, pegRatio: 3.1, roe: 0.04, netMargin: 0.01, debtToEquity: 260, currentRatio: 0.8, revenueGrowth: -0.05, earningsGrowth: null, dividendYield: null })
const wl = (label) => weak.find((o) => o.label === label)?.level
assert.equal(wl('Financial Strength'), 'Weak')
assert.equal(wl('Profitability'), 'Poor')
assert.equal(wl('Valuation'), 'Overvalued')
assert.equal(wl('Growth'), 'Low')
assert.equal(wl('Dividend'), 'None')
assert.equal(wl('Overall Fundamental Outlook'), 'Weak')
const empty = deriveOutlook({})
assert.ok(empty.every((o) => o.level === 'N/A' || o.level === 'None' || o.label === 'Overall Fundamental Outlook'), 'missing data → N/A, never guessed')

// mapping with a totally empty quoteSummary → all N/A, no throw
const bare = mapFundamentals({}, 'X.NS')
assert.ok(bare.sections.flatMap((s) => s.rows).every((r) => typeof r.value === 'string'), 'empty input handled')

// ── ISOLATION GUARANTEE ──────────────────────────────────────────────────────
// SCORING & LEARNING must never see fundamentals: engines (scores/badges),
// featureSnapshot (inputs), batch (analysis pipeline), cri (learning loop).
// analysisStore is intentionally EXEMPT: it performs a read-only JOIN for
// universe FILTERING/display — after all scores are already computed & stored.
for (const f of ['src/engines.js', 'src/featureSnapshot.js', 'src/batch.js', 'src/cri.js']) {
  const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.ok(!src.includes('fundamentals'), `${f} must not reference fundamentals`)
}
// and the analysisStore usage must remain read-only (no writes to scores from f.*)
{
  const src = fs.readFileSync(new URL('../src/analysisStore.js', import.meta.url), 'utf8')
  assert.ok(!/UPDATE\s+stock_analysis_reports[\s\S]{0,200}stock_fundamentals/i.test(src), 'fundamentals must never write into analysis reports')
}

// grade extraction for filter columns
import { extractGrades } from '../src/fundamentals.js'
{
  const g = extractGrades(mapped.outlook)
  assert.equal(g.overall_grade, 'Positive')
  assert.equal(g.fin_strength, 'Strong')
  assert.equal(g.valuation_grade, 'Undervalued')
  const gNA = extractGrades(deriveOutlook({}))
  assert.equal(gNA.overall_grade, null, 'N/A grades stored as NULL (not filterable as real values)')
}

console.log('✓ fundamentals mapping, outlook derivation, and isolation guarantee passed')
