import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { registerApi } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import type { RegisterRequest } from '@/types/auth'

type FormValues = {
  firstName: string
  lastName: string
  emailId: string
  mobileNumber: string
  userPassword: string
  confirmPassword: string
}

export default function RegisterPage() {
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>()

  const onSubmit = async (data: FormValues) => {
    const payload: RegisterRequest = {
      emailId: data.emailId,
      userPassword: data.userPassword,
      mobileNumber: data.mobileNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      preferences: {
        theme: 'Dark',
        prefType: 'WEB',
        colorCode: '1D1616',
      },
    }

    try {
      await registerApi(payload)
      toast.success('Account created! Please sign in.')
      navigate('/login')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Registration failed. Please try again.'
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-surface-dark transition-colors duration-300">
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-brand-700 dark:bg-brand-900 p-12 text-white">
        <div className="flex items-center gap-3">
          <VTraderLogo />
          <span className="text-xl font-semibold tracking-tight">VTrader</span>
        </div>
        <div className="animate-fade-in">
          <h1 className="text-4xl font-bold leading-snug mb-4">
            Start trading smarter<br />in minutes.
          </h1>
          <p className="text-brand-200 text-lg leading-relaxed max-w-md">
            Connect your broker, pick a strategy, and let VTrader do the heavy lifting.
            No coding required.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-brand-200">
          {[
            'Multiple broker support',
            'Backtested strategy templates',
            'Real-time P&L analytics',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <CheckIcon />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col flex-1 items-center justify-center px-6 py-12 relative overflow-y-auto">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8">
          <VTraderLogo className="text-brand-600 dark:text-brand-400" />
          <span className="text-xl font-semibold text-slate-900 dark:text-white">VTrader</span>
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Create account</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                placeholder="Viren"
                autoComplete="given-name"
                error={errors.firstName?.message}
                {...register('firstName', { required: 'Required' })}
              />
              <Input
                label="Last name"
                placeholder="Kumar"
                autoComplete="family-name"
                error={errors.lastName?.message}
                {...register('lastName', { required: 'Required' })}
              />
            </div>

            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.emailId?.message}
              icon={<EmailIcon />}
              {...register('emailId', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
              })}
            />

            <Input
              label="Mobile number"
              type="tel"
              placeholder="9876543210"
              autoComplete="tel"
              error={errors.mobileNumber?.message}
              icon={<PhoneIcon />}
              {...register('mobileNumber', {
                required: 'Mobile number is required',
                pattern: { value: /^\d{10}$/, message: 'Enter a 10-digit number' },
              })}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              error={errors.userPassword?.message}
              icon={<LockIcon />}
              {...register('userPassword', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
              })}
            />

            <Input
              label="Confirm password"
              type="password"
              placeholder="Re-enter password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              icon={<LockIcon />}
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (val) =>
                  val === watch('userPassword') || 'Passwords do not match',
              })}
            />

            <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">
              Create account
            </Button>
          </form>

          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
            By signing up you agree to our{' '}
            <span className="underline cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
              Terms
            </span>{' '}
            and{' '}
            <span className="underline cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
              Privacy Policy
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── helpers ── */
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

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-brand-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
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

function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5 19.79 19.79 0 01.03 2.82 2 2 0 012 .67h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.29a16 16 0 006.07 6.07l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
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
