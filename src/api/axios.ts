import axios from 'axios'

const BASE_URL        = 'https://api.vtrader.in'
const SIGNAL_BASE_URL = 'http://164.52.201.122:3500'

export const axiosPublic = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export const axiosPrivate = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

/** Dedicated instance for the signal micro-service */
export const axiosSignal = axios.create({
  baseURL: SIGNAL_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Shared interceptor setup
function applyPrivateInterceptors(instance: ReturnType<typeof axios.create>) {
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('vtrader_token')
      if (token) config.headers.authorization = `Bearer ${token}`
      return config
    },
    (error) => Promise.reject(error),
  )
  instance.interceptors.response.use(
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
}

applyPrivateInterceptors(axiosPrivate)
applyPrivateInterceptors(axiosSignal)
