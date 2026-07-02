import { axiosPublic } from './axios'
import type { LoginRequest, LoginResponse, RegisterRequest } from '@/types/auth'

export const loginApi = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await axiosPublic.post<LoginResponse>('/users/api/login', data)
  return response.data
}

export const registerApi = async (data: RegisterRequest): Promise<{ message: string }> => {
  const response = await axiosPublic.post<{ message: string }>('/users/register', data)
  return response.data
}
