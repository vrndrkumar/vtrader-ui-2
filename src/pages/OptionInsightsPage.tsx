export default function OptionInsightsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      {/* Icon */}
      <div className="mb-6 h-20 w-20 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        Option Insights
      </h1>
      <p className="text-sm font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-widest mb-4">
        Coming Soon
      </p>

      {/* Description */}
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
        AI-powered analysis of options pricing, implied volatility skew, Greeks exposure, and market sentiment — all in one place. We're building something great and will launch it in a future release.
      </p>

      {/* Feature previews */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl w-full text-left">
        {[
          { icon: '📊', title: 'IV Analysis', desc: 'Implied volatility surface and skew charts across strikes and expiries.' },
          { icon: '🧮', title: 'Greeks Dashboard', desc: 'Portfolio-level Delta, Gamma, Theta, and Vega exposure at a glance.' },
          { icon: '🤖', title: 'AI Signals', desc: 'Machine-learning based fair value and mispricing alerts for options.' },
        ].map((f) => (
          <div key={f.title} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark">
            <div className="text-2xl mb-2">{f.icon}</div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{f.title}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
