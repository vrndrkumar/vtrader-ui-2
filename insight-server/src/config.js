import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT || 3600),
  candleBaseUrl: process.env.CANDLE_BASE_URL || 'https://data.vtrader.in',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  db: {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
  },
  benchmarkSymbol: 'NIFTY',
}
