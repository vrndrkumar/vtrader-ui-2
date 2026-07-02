import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { jwtDecode } from 'jwt-decode'
import type { JwtPayload, UserProfile } from '@/types/auth'
import { clearIndexMasterCache } from '@/services/indexMasterCache'

interface AuthContextValue {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'vtrader_token'

function decodeUser(token: string): UserProfile | null {
  try {
    const payload = jwtDecode<JwtPayload>(token)
    // Check token not expired
    if (payload.exp * 1000 < Date.now()) return null
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) {
      const decoded = decodeUser(stored)
      if (decoded) {
        setToken(stored)
        setUser(decoded)
      } else {
        localStorage.removeItem(TOKEN_KEY)
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback((newToken: string) => {
    const decoded = decodeUser(newToken)
    if (!decoded) return
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(decoded)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    clearIndexMasterCache()
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
