const path = require('path')
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
}

const express = require('express')
const fs = require('fs')
const http = require('http')
const { createProxyMiddleware } = require('http-proxy-middleware')

const app = express()

const WORKDIR = process.env.WORKDIR || process.env.WORKDIR_LOCAL
const IMAGE_DIR = path.join(WORKDIR, 'image')
const INDEX_HTML = path.join(WORKDIR, 'index.html')

const backendUrl = process.env.TODO_BACKEND_URL
const PORT = process.env.TODO_APP_PORT

// Fail if missing environment variables
if (!WORKDIR) throw new Error('WORKDIR environment variable is required');
if (!backendUrl) throw new Error('BACKEND_URL environment variable is required');
if (!PORT) throw new Error('PORT environment variable is required');

// Ensure image folder exists
fs.mkdirSync(IMAGE_DIR, { recursive: true })

// Proxy /api requests to backend
app.use('/api', createProxyMiddleware({
  target: backendUrl,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${backendUrl}${req.originalUrl.replace(/^\/api/, '')}`)
  }
}))

// Health check endpoint
app.get('/healthz', (req, res) => {
  const url = new URL(backendUrl.replace(/\/$/, '') + '/healthz')
  const protocol = url.protocol === 'https:' ? require('https') : http

  protocol.get(url, (resp) => {
    if (resp.statusCode === 200) {
      res.status(200).json({ status: 'ok', backend: 'connected' })
    } else {
      res.status(503).json({ status: 'unavailable', backend: 'error' })
    }
  }).on('error', (err) => {
    res.status(503).json({ status: 'unavailable', backend: 'error', error: err.message })
  })
})

// Serve static images
app.use(express.static(IMAGE_DIR))

// Serve main HTML
app.get('/', (req, res) => res.sendFile(INDEX_HTML))

app.listen(PORT, () => console.log(`Todo-app running on port ${PORT}`))
