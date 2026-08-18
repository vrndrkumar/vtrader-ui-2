import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { getStrategyConfigs, getUserStrategies } from '@/api/strategy'
import type { StrategyConfig, UserStrategy } from '@/types/strategy'
import { isUserStrategyDeployed, isTemplateVisible } from '@/types/strategy'
import { useAuth } from '@/hooks/useAuth'
import { StrategyCard } from '@/components/strategies/StrategyCard'
import { SubscribeModal } from '@/components/strategies/SubscribeModal'

type Tab = 'templates' | 'my' | 'deployed'

const TABS: { id: Tab; label: string }[] = [
  { id: 'my',        label: 'My Strategies' },
  { id: 'deployed',  label: 'Deployed Strategies' },
  { id: 'templates', label: 'Strategy Templates' },
]

export default function StrategiesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  // Default to 'my' so user lands on their own strategies first
  const [activeTab, setActiveTab]             = useState<Tab>('my')
  const [search, setSearch]                   = useState('')
  const [configs, setConfigs]                 = useState<StrategyConfig[]>([])
  const [userStrategies, setUserStrategies]   = useState<UserStrategy[]>([])
  const [loading, setLoading]                 = useState(true)
  const [usLoading, setUsLoading]             = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [subscribeTarget, setSubscribeTarget] = useState<StrategyConfig | null>(null)
  const [editTarget, setEditTarget]           = useState<UserStrategy | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setUsLoading(true)
    setError(null)

    // Both APIs fire in parallel
    const [cfgResult, usResult] = await Promise.allSettled([
      getStrategyConfigs(),
      getUserStrategies(),
    ])

    if (cfgResult.status === 'fulfilled') setConfigs(cfgResult.value)
    else setError('Failed to load strategies.')

    if (usResult.status === 'fulfilled') setUserStrategies(usResult.value)

    setLoading(false)
    setUsLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Match by strategyName (API) → strategyCode (config) ──────────────────
  // The user-strategies API returns `strategyName` = e.g. "ZERO_HERO_REPLICA"
  // which equals StrategyConfig.strategyCode.
  const userStrategyByCode = useMemo(() => {
    const map = new Map<string, UserStrategy>()
    userStrategies.forEach((us) => {
      // Primary key: strategyName field in the API response
      const name = (us.strategyName ?? us.strategyCode ?? us.strategy_code ?? '') as string
      if (name) map.set(name.toUpperCase(), us)
    })
    return map
  }, [userStrategies])

  const getUserStrategy = useCallback(
    (cfg: StrategyConfig): UserStrategy | undefined =>
      userStrategyByCode.get(cfg.strategyCode.toUpperCase()),
    [userStrategyByCode],
  )

  // ── Derived lists ─────────────────────────────────────────────────────────
  // Templates: admins see every status; users see PUBLISHED only.
  const activeConfigs = useMemo(
    () => configs.filter((c) => isTemplateVisible(c, isAdmin) && c.configData?.isActive !== false),
    [configs, isAdmin],
  )

  const myStrategyConfigs = useMemo(
    () => configs.filter((c) => !!getUserStrategy(c)),
    [configs, getUserStrategy],
  )

  const deployedStrategyConfigs = useMemo(
    () => myStrategyConfigs.filter((c) => {
      const us = getUserStrategy(c)
      return us ? isUserStrategyDeployed(us) : false
    }),
    [myStrategyConfigs, getUserStrategy],
  )

  const filterBySearch = (list: StrategyConfig[]) => {
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (c) =>
        c.strategyName.toLowerCase().includes(q) ||
        c.strategyCode.toLowerCase().includes(q),
    )
  }

  const displayList =
    activeTab === 'templates' ? filterBySearch(activeConfigs)
    : activeTab === 'my'      ? filterBySearch(myStrategyConfigs)
    :                           filterBySearch(deployedStrategyConfigs)

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openSubscribe = (strategy: StrategyConfig) => setSubscribeTarget(strategy)
  const openEdit = (us: UserStrategy) => {
    const name = (us.strategyName ?? us.strategyCode ?? '') as string
    const cfg = configs.find(
      (c) => c.strategyCode.toUpperCase() === name.toUpperCase(),
    )
    if (cfg) { setSubscribeTarget(cfg); setEditTarget(us) }
  }
  const closeModal    = () => { setSubscribeTarget(null); setEditTarget(null) }
  const handleSuccess = () => { closeModal(); fetchAll() }

  const counts: Record<Tab, number> = {
    templates: activeConfigs.length,
    my:        myStrategyConfigs.length,
    deployed:  deployedStrategyConfigs.length,
  }

  const isDataLoading = loading || usLoading

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Strategies</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Browse and subscribe to algo strategies
            </p>
          </div>
          {!loading && counts.templates > 0 && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              {counts.templates} available
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'relative px-4 py-2.5 text-sm font-medium transition-colors duration-150 flex items-center gap-2',
                activeTab === tab.id
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              {tab.label}
              {/* Show count badge; show spinner dots while loading my/deployed */}
              {(tab.id === 'templates' ? counts.templates > 0 : !isDataLoading && counts[tab.id] > 0) && (
                <span className={clsx(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                  activeTab === tab.id
                    ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400',
                )}>
                  {counts[tab.id]}
                </span>
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400 rounded-t" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-6 py-3">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {isDataLoading ? (
          <div className="flex items-center justify-center py-24">
            <svg className="animate-spin h-7 w-7 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">{error}</p>
            <button onClick={fetchAll} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">Retry</button>
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {(activeTab === 'my' || activeTab === 'deployed') ? (
              <>
                <p className="text-slate-600 dark:text-slate-300 font-medium mb-1">
                  {activeTab === 'deployed' ? 'No deployed strategies' : 'No subscriptions yet'}
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">
                  Go to Strategy Templates to subscribe.
                </p>
                <button
                  onClick={() => setActiveTab('templates')}
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                >
                  Browse Templates
                </button>
              </>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-sm">No strategies match your search.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayList.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                userStrategy={getUserStrategy(strategy)}
                tabContext={activeTab}
                onSubscribe={openSubscribe}
                onEdit={openEdit}
                onRefresh={fetchAll}
              />
            ))}
          </div>
        )}
      </div>

      {subscribeTarget && (
        <SubscribeModal
          strategy={subscribeTarget}
          existing={editTarget ?? undefined}
          onClose={closeModal}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
