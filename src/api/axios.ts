import axios from 'axios'

const BASE_URL        = 'https://api.vtrader.in'
const SIGNAL_BASE_URL = 'http://164.52.201.122:3500'
const CANDLE_BASE_URL = 'https://data.vtrader.in' // dedicated candle-history host

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

/**
 * Dedicated instance for the candle-history service (data.vtrader.in).
 * No custom headers / auth on purpose: this keeps it a CORS "simple request"
 * (a plain GET) so the browser does NOT send a preflight OPTIONS. Adding an
 * Authorization or Content-Type header would trigger preflight, which fails
 * unless the server explicitly handles it. The endpoint is credential-free.
 */
export const axiosCandle = axios.create({
  baseURL: CANDLE_BASE_URL,
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
