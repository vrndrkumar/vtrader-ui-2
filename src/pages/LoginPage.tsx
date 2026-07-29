import { useForm } from 'react-hook-form'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { loginApi } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { useBrokerStore } from '@/store/brokerStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import type { LoginRequest } from '@/types/auth'

// ── Brand colours ─────────────────────────────────────────────────────────────
const AMBER  = '#FBBF24'
const PURPLE = '#7C5CFF'
const NAVY   = '#0B1020'
const CARD   = '#0C1228'

// ── V-Reversal mark (inline SVG) ─────────────────────────────────────────────
function VMarkSVG({ size = 40 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"
      style={{ width: size, height: size, flexShrink: 0 }}>
      <defs>
        <linearGradient id="lp-vt-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={PURPLE} />
          <stop offset="100%" stopColor={AMBER} />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill={CARD} />
      {/* Left arm: teal */}
      <line x1="5" y1="6" x2="18" y2="28" stroke={AMBER} strokeWidth="2.6" strokeLinecap="round" />
      {/* Right arm lower: gradient (vertex → trigger) */}
      <line x1="18" y1="28" x2="24" y2="18" stroke="url(#lp-vt-grad)" strokeWidth="2.6" strokeLinecap="round" />
      {/* Right arm upper: purple, dimmed */}
      <line x1="24" y1="18" x2="31" y2="6" stroke={PURPLE} strokeWidth="2.4" strokeLinecap="round" opacity={0.45} />
      {/* Trigger line: dashed left */}
      <line x1="2" y1="17" x2="9" y2="17" stroke={AMBER} strokeWidth="1.1" strokeDasharray="2,1.5" strokeLinecap="round" opacity={0.55} />
      {/* Trigger line: solid right */}
      <line x1="15" y1="17" x2="21" y2="17" stroke={AMBER} strokeWidth="1.1" strokeLinecap="round" opacity={0.65} />
      {/* Execution pulse */}
      <circle cx="12" cy="17" r="3.8" fill={AMBER} fillOpacity={0.1} />
      <circle cx="12" cy="17" r="2.1" fill={AMBER} />
      <circle cx="11.5" cy="16.5" r="0.65" fill="white" opacity={0.85} />
    </svg>
  )
}

// ── Decorative rising chart (background of left panel) ───────────────────────
function ChartDecor() {
  return (
    <svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg"
      className="absolute right-0 bottom-24 w-[420px] opacity-[0.18] pointer-events-none select-none">
      {/* Horizontal grid lines */}
      {[40, 90, 140, 190, 240].map(y => (
        <line key={y} x1="0" y1={y} x2="420" y2={y}
          stroke={AMBER} strokeWidth="0.6" strokeDasharray="6,6" opacity="0.4" />
      ))}
      {/* Price trigger level */}
      <line x1="0" y1="110" x2="420" y2="110"
        stroke={AMBER} strokeWidth="1.2" strokeDasharray="8,5" opacity="0.7" />
      <text x="4" y="106" fontSize="8" fill={AMBER} fontFamily="monospace" opacity="0.9">TRIGGER LEVEL</text>
      {/* Rising price line */}
      <path d="M 10 240 C 60 220 100 200 140 175 C 180 150 210 138 250 118 C 285 100 320 88 380 65 C 395 60 408 55 418 50"
        stroke={AMBER} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Candles — green going up */}
      {[
        { x: 30,  lo: 230, hi: 215, o: 228, c: 216 },
        { x: 60,  lo: 215, hi: 196, o: 212, c: 198 },
        { x: 90,  lo: 200, hi: 182, o: 198, c: 184 },
        { x: 120, lo: 184, hi: 164, o: 182, c: 166 },
        { x: 150, lo: 168, hi: 148, o: 165, c: 150 },
        { x: 185, lo: 152, hi: 130, o: 149, c: 132 },
        { x: 220, lo: 135, hi: 114, o: 132, c: 116 },
        { x: 260, lo: 118, hi: 95,  o: 115, c: 97  },
        { x: 300, lo: 102, hi: 80,  o: 99,  c: 82  },
        { x: 345, lo: 88,  hi: 65,  o: 85,  c: 67  },
        { x: 385, lo: 70,  hi: 48,  o: 67,  c: 50  },
      ].map(({ x, lo, hi, o, c }) => (
        <g key={x}>
          {/* Wick */}
          <line x1={x} y1={lo} x2={x} y2={hi} stroke={AMBER} strokeWidth="1" />
          {/* Body */}
          <rect x={x - 4} y={c} width="8" height={o - c}
            fill={AMBER} opacity="0.7" rx="1" />
        </g>
      ))}
      {/* Execution pulse at trigger crossing */}
      <circle cx="252" cy="118" r="8" fill={AMBER} fillOpacity="0.15" />
      <circle cx="252" cy="118" r="4" fill={AMBER} fillOpacity="0.6" />
      {/* Arrow / flow: Price Level → Trigger → Execute */}
      <g transform="translate(310, 30)" opacity="0.85">
        <rect x="0" y="0" width="70" height="18" rx="4"
          fill="none" stroke={AMBER} strokeWidth="0.8" />
        <text x="35" y="12.5" fontSize="7" fill={AMBER} textAnchor="middle" fontFamily="monospace">PRICE LEVEL</text>
        <line x1="35" y1="18" x2="35" y2="26" stroke={AMBER} strokeWidth="0.8" />
        <polygon points="31,26 39,26 35,30" fill={AMBER} />
        <rect x="0" y="30" width="70" height="18" rx="4"
          fill={AMBER} fillOpacity="0.25" stroke={AMBER} strokeWidth="0.8" />
        <text x="35" y="42.5" fontSize="7" fill={AMBER} textAnchor="middle" fontFamily="monospace" fontWeight="bold">TRIGGER</text>
        <line x1="35" y1="48" x2="35" y2="56" stroke={AMBER} strokeWidth="0.8" />
        <polygon points="31,56 39,56 35,60" fill={PURPLE} />
        <rect x="0" y="60" width="70" height="22" rx="4"
          fill={PURPLE} fillOpacity="0.3" stroke={PURPLE} strokeWidth="0.8" />
        <text x="35" y="69.5" fontSize="7" fill="white" textAnchor="middle" fontFamily="monospace" fontWeight="bold">EXECUTE</text>
        <text x="35" y="78" fontSize="7" fill="white" textAnchor="middle" fontFamily="monospace" fontWeight="bold">ORDER</text>
      </g>
    </svg>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[22px] font-bold text-white leading-none">{value}</p>
      <p className="text-[11px] tracking-wide" style={{ color: AMBER }}>{label}</p>
    </div>
  )
}

// ── Feature pill ──────────────────────────────────────────────────────────────
function FeaturePill({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full text-[11px] font-semibold"
      style={{
        background: 'rgba(0,229,187,0.07)',
        border: '1px solid rgba(0,229,187,0.22)',
        color: AMBER,
      }}>
      {label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/dashboard'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>()

  const onSubmit = async (data: LoginRequest) => {
    try {
      const res = await loginApi(data)
      const token = res.token ?? (res as unknown as string)
      if (!token) throw new Error('No token received')
      login(token, res.user)
      useBrokerStore.getState().reset()
      if (res.preferences?.BROKER?.length) useBrokerStore.getState().hydrate(res.preferences.BROKER)
      toast.success('Welcome back!')
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Invalid credentials'
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: NAVY }}>

      {/* ── Left panel — brand ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[54%] relative overflow-hidden"
        style={{ background: `linear-gradient(150deg, #0D1530 0%, ${NAVY} 60%, #0C1028 100%)` }}>

        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, transparent, ${AMBER} 40%, ${PURPLE} 60%, transparent)` }} />

        {/* Subtle dot grid */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(0,229,187,0.06) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }} />

        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, rgba(0,229,187,0.055) 0%, rgba(124,92,255,0.04) 45%, transparent 70%)` }} />

        {/* Decorative chart */}
        <ChartDecor />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-3 mb-auto">
            <VMarkSVG size={46} />
            <div>
              <p className="font-display text-[18px] font-bold tracking-[0.08em] leading-none text-white">
                Trader
              </p>
            </div>
          </div>

          {/* Hero copy — pushed to vertical center */}
          <div className="my-auto">
            <div className="mb-6">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.12em] uppercase mb-6"
                style={{ background: 'rgba(0,229,187,0.1)', border: `1px solid rgba(0,229,187,0.25)`, color: AMBER }}>
                ✦ Trading Engine
              </span>
            </div>
            <h1 className="font-display text-[38px] font-bold leading-[1.18] text-white mb-3">
              Not Just a Platform.
            </h1>
            <h1 className="font-display text-[38px] font-bold leading-[1.18] mb-6"
              style={{ color: AMBER }}>
              Your Trading Engine.
            </h1>
            <p className="text-[14px] leading-relaxed max-w-[390px] mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Set price levels directly on charts. When the market reaches your target,
              VTrader executes automatically — no manual intervention required.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2">
              {['Chart-Based Trading', 'Price Triggers', 'Algo Strategies', 'Options Tools', 'Automation'].map(f => (
                <FeaturePill key={f} label={f} />
              ))}
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex gap-10 pt-8 mt-auto border-t" style={{ borderColor: 'rgba(0,229,187,0.1)' }}>
            <Stat label="Win Rate" value="59%" />
            <Stat label="Total Trades" value="2,240+" />
            <Stat label="Avg Daily P&L" value="₹33" />
          </div>
        </div>
      </div>

      {/* ── Right panel — form ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 items-center justify-center px-6 py-12 relative"
        style={{ background: 'rgba(255,255,255,0.015)', backdropFilter: 'blur(0px)' }}>

        {/* Subtle right panel tint */}
        <div className="absolute inset-0 dark:bg-transparent bg-white/90" />

        {/* Theme toggle */}
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>

        {/* Mobile logo */}
        <div className="relative z-10 flex lg:hidden items-center gap-2 mb-8">
          <VMarkSVG size={38} />
          <div>
            <p className="font-display text-[16px] font-bold tracking-[0.06em] leading-none text-slate-900 dark:text-white">
              Trader
            </p>
            <p className="text-[9px] tracking-[0.14em] uppercase mt-0.5 font-semibold"
              style={{ color: AMBER }}>
              Not Just a Platform
            </p>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-sm animate-slide-up">

          {/* Card */}
          <div className="rounded-2xl p-8 shadow-2xl"
            style={{
              background: 'rgba(12,18,40,0.85)',
              border: '1px solid rgba(0,229,187,0.12)',
              boxShadow: `0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,187,0.06)`,
            }}>

            {/* Card top accent */}
            <div className="h-[1.5px] rounded-full mb-7 -mx-8 mt-[-32px]"
              style={{ background: `linear-gradient(90deg, transparent, ${AMBER} 50%, transparent)` }} />

            <h2 className="font-display text-[22px] font-bold text-white mb-1">Welcome back</h2>
            <p className="text-[13px] mb-7" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold hover:underline" style={{ color: AMBER }}>
                Create one
              </Link>
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.username?.message}
                icon={<EmailIcon />}
                {...register('username', {
                  required: 'Email is required',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
                })}
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                error={errors.password?.message}
                icon={<LockIcon />}
                {...register('password', { required: 'Password is required' })}
              />

              <div className="flex justify-end">
                <button type="button" className="text-[12px] hover:underline font-medium"
                  style={{ color: AMBER }}>
                  Forgot password?
                </button>
              </div>

              <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-1">
                Sign in to VTrader
              </Button>
            </form>

            {/* Bottom tagline */}
            <p className="text-center text-[10px] mt-6 tracking-[0.08em]"
              style={{ color: 'rgba(255,255,255,0.18)' }}>
              NOT JUST A PLATFORM. YOUR TRADING ENGINE.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Icon helpers ──────────────────────────────────────────────────────────────
function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}
