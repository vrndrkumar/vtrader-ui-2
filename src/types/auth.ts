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

/** Shape returned by the server in the `user` field of the login response. */
export interface LoginResponseUser {
  id: number
  firstName: string
  lastName: string
  emailId: string
  mobileNumber: string | null
  roles: string
}

export interface LoginResponse {
  token: string
  user?: LoginResponseUser
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
  firstName?: string
  lastName?: string
  iat: number
  exp: number
}

export interface AuthState {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}
