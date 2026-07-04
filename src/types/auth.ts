export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  emailId: string
  userPassword: string
  mobileNumber: string
  firstName: string
  lastName: string
  preferences: {
    theme: 'Light' | 'Dark'
    prefType: 'WEB'
    colorCode: string
  }
}

export interface LoginResponse {
  token: string
  user?: UserProfile
  message?: string
  preferences?: {
    WEB?: { id: number; theme: string; language: string }[]
    BROKER?: { id: number; default: boolean; brokerName: string; displayName: string; quantity: Record<string, number> }[]
  }
}

export interface UserProfile {
  userId: number
  username: string
  role: string
  firstName?: string
  lastName?: string
}

// Decoded JWT payload
export interface JwtPayload {
  userId: number
  username: string
  role: string
  iat: number
  exp: number
}

export interface AuthState {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}
