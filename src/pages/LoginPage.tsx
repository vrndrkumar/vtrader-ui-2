import { useForm } from 'react-hook-form'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { loginApi } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import type { LoginRequest } from '@/types/auth'

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
      login(token)
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
    <div className="min-h-screen flex bg-slate-50 dark:bg-surface-dark transition-colors duration-300">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-brand-700 dark:bg-brand-900 p-12 text-white">
        <div className="flex items-center gap-3">
          <VTraderLogo />
          <span className="text-xl font-semibold tracking-tight">VTrader</span>
        </div>
        <div className="animate-fade-in">
          <h1 className="text-4xl font-bold leading-snug mb-4">
            Algorithmic trading,<br />reimagined.
          </h1>
          <p className="text-brand-200 text-lg leading-relaxed max-w-md">
            Deploy automated strategies, monitor performance in real-time, and trade smarter —
            all from a single dashboard.
          </p>
        </div>
        <div className="flex gap-8 text-sm text-brand-200">
          <Stat label="Win Rate" value="59%" />
          <Stat label="Total Trades" value="2,240+" />
          <Stat label="Avg Daily P&L" value="₹33" />
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col flex-1 items-center justify-center px-6 py-12 relative">
        {/* Theme toggle */}
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8">
          <VTraderLogo className="text-brand-600 dark:text-brand-400" />
          <span className="text-xl font-semibold text-slate-900 dark:text-white">VTrader</span>
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Sign in</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
            >
              Create one
            </Link>
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
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
              <button
                type="button"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-1">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ── helpers ── */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-brand-300 text-xs mt-0.5">{label}</p>
    </div>
  )
}

function VTraderLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="currentColor"
      className={`h-8 w-8 ${className ?? 'text-white'}`}
    >
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.15" />
      <polyline
        points="4,22 10,12 16,18 22,8 28,14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="14" r="2" fill="currentColor" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}
