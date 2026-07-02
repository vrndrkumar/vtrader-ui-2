import axios from 'axios'

const BASE_URL = 'https://api.vtrader.in'

export const axiosPublic = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export const axiosPrivate = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token to every private request
axiosPrivate.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vtrader_token')
    if (token) {
      config.headers.authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Redirect to login on 401
axiosPrivate.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('vtrader_token')
      localStorage.removeItem('vtrader_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)
