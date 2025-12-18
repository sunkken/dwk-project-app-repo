const path = require('path')
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
}

const express = require('express')
const morgan = require('morgan')
const { Pool } = require('pg')
const { connect, StringCodec } = require('nats')

const app = express()
app.use(express.json())

// ---- Morgan logging ----
morgan.token('body', req => JSON.stringify(req.body))
app.use(
  morgan((tokens, req, res) => {
    const parts = [
      tokens.method(req, res),
      tokens.url(req, res),
      tokens.status(req, res),
      tokens.res(req, res, 'content-length'), '-',
      tokens['response-time'](req, res), 'ms'
    ]
    if (req.method === 'POST' || req.method === 'PUT') {
      parts.push('-', tokens.body(req, res))
    }
    return parts.join(' ')
  })
)

// ---- In-memory fallback todos ----
const nowIso = new Date().toISOString()
let todos = [
  { id: 1, text: 'Learn JavaScript', done: false, createdAt: nowIso, updatedAt: nowIso },
  { id: 2, text: 'Learn React', done: false, createdAt: nowIso, updatedAt: nowIso },
  { id: 3, text: 'Build a project', done: false, createdAt: nowIso, updatedAt: nowIso },
]

// ---- Postgres setup ----
const dbVars = ['TODO_DB_HOST', 'TODO_DB_PORT', 'TODO_DB_USER', 'TODO_DB_PASS', 'TODO_DB_NAME']
const missingVars = dbVars.filter(v => !process.env[v])

let db = null
let usingDb = false
let isReconnecting = false
const isProd = process.env.NODE_ENV === 'production'

const sleep = (ms) => new Promise(res => setTimeout(res, ms))

// ---- NATS setup ----
const NATS_URL = process.env.NATS_URL
const NATS_SUBJECT = process.env.NATS_SUBJECT || 'todos.events'
const sc = StringCodec()

let nc = null
let natsReady = false
let natsReconnecting = false

async function initNatsWithRetry() {
  if (!NATS_URL) {
    console.warn('NATS_URL not set, skipping NATS initialization')
    natsReady = false
    return
  }

  const maxAttempts = isProd ? 20 : 1
  const delayMs = 5000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      nc = await connect({ servers: NATS_URL })
      natsReady = true
      natsReconnecting = false
      console.log(`NATS ready after ${attempt} attempt(s). Connected to ${NATS_URL}`)
      return
    } catch (err) {
      console.error(`NATS init failed (attempt ${attempt}/${maxAttempts}):`, err.message)
      natsReady = false
      if (attempt === maxAttempts) {
        console.error(`Giving up on NATS (mode: ${isProd ? 'prod' : 'dev'}), publishing will be skipped.`)
        natsReconnecting = false
        return
      }
      await sleep(delayMs)
    }
  }
}

async function publishEvent(type, data) {
  if (!nc || !natsReady) {
    console.warn(`[NATS] Not connected, skipping publish: type=${type}`)
    return
  }

  try {
    const message = {
      type,
      data,
      meta: {
        source: 'todo-backend',
        version: '1.0',
        timestamp: new Date().toISOString(),
      }
    }
    nc.publish(NATS_SUBJECT, sc.encode(JSON.stringify(message)))
    console.log(`[NATS] Published ${type} to ${NATS_SUBJECT}`)
  } catch (err) {
    console.error(`[NATS] Failed to publish ${type}:`, err.message)
  }
}

async function natsReconnectIfNeeded() {
  if (!nc || natsReconnecting) return
  natsReconnecting = true
  console.log('NATS connection lost, attempting to reconnect...')
  await initNatsWithRetry()
}

if (!NATS_URL) {
  console.warn('NATS not configured (NATS_URL missing); NATS messaging disabled.')
} else {
  initNatsWithRetry()
}

async function initDbWithRetry() {
  db = new Pool({
    host: process.env.TODO_DB_HOST,
    port: process.env.TODO_DB_PORT,
    user: process.env.TODO_DB_USER,
    password: process.env.TODO_DB_PASS,
    database: process.env.TODO_DB_NAME,
  })

  const maxAttempts = isProd ? 20 : 1
  const delayMs = 5000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Ensure table exists before we start serving traffic (boolean done, timestamps)
      await db.query(`CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)

      const res = await db.query('SELECT * FROM todos ORDER BY id ASC')
      // Normalize rows to in-memory shape
      todos = res.rows.map(r => ({
        id: r.id,
        text: r.text,
        done: !!r.done,
        createdAt: r.created_at ? r.created_at.toISOString() : nowIso,
        updatedAt: r.updated_at ? r.updated_at.toISOString() : nowIso
      }))
      usingDb = true
      isReconnecting = false
      console.log(`DB ready after ${attempt} attempt(s). Loaded ${todos.length} todos.`)
      return
    } catch (err) {
      console.error(`DB init failed (attempt ${attempt}/${maxAttempts}):`, err.message)
      usingDb = false
      if (attempt === maxAttempts) {
        console.error(`Giving up on DB (mode: ${isProd ? 'prod' : 'dev'}), using in-memory todos only.`)
        isReconnecting = false
        return
      }
      await sleep(delayMs)
    }
  }
}

async function reconnectIfNeeded() {
  if (!db || isReconnecting) return
  isReconnecting = true
  console.log('DB connection lost, attempting to reconnect...')
  await initDbWithRetry()
}

if (missingVars.length) {
  console.warn(`Running without database, missing env vars: ${missingVars.join(', ')}`)
} else {
  initDbWithRetry()
}

// ---- Async helper ----
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

// ---- Storage helpers ----
const getAllTodos = async () => {
  if (usingDb && db) {
    try {
      const result = await db.query('SELECT * FROM todos ORDER BY id ASC')
      return result.rows.map(r => ({ id: r.id, text: r.text, done: !!r.done, createdAt: r.created_at ? r.created_at.toISOString() : null, updatedAt: r.updated_at ? r.updated_at.toISOString() : null }))
    } catch (err) {
      console.error('DB query failed in getAllTodos:', err.message)
      usingDb = false
      reconnectIfNeeded()
      return todos
    }
  }
  return todos
}

const getTodoById = async (id) => {
  if (usingDb && db) {
    try {
      const result = await db.query('SELECT * FROM todos WHERE id = $1', [id])
      const r = result.rows[0]
      if (!r) return null
      return { id: r.id, text: r.text, done: !!r.done, createdAt: r.created_at ? r.created_at.toISOString() : null, updatedAt: r.updated_at ? r.updated_at.toISOString() : null }
    } catch (err) {
      console.error('DB query failed in getTodoById:', err.message)
      usingDb = false
      reconnectIfNeeded()
      return todos.find(t => t.id === id) || null
    }
  }
  return todos.find(t => t.id === id) || null
}

const createTodo = async (text) => {
  const createdAt = new Date().toISOString()
  if (usingDb && db) {
    try {
      const result = await db.query('INSERT INTO todos (text, done, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING *', [text, false, createdAt])
      const r = result.rows[0]
      const todo = { id: r.id, text: r.text, done: !!r.done, createdAt: r.created_at ? r.created_at.toISOString() : createdAt, updatedAt: r.updated_at ? r.updated_at.toISOString() : createdAt }
      return { todo, persisted: true }
    } catch (err) {
      console.error('DB query failed in createTodo:', err.message)
      usingDb = false
      reconnectIfNeeded()
      const newTodo = { id: todos.length ? todos[todos.length - 1].id + 1 : 1, text, done: false, createdAt, updatedAt: createdAt }
      todos.push(newTodo)
      return { todo: newTodo, persisted: false }
    }
  }
  const newTodo = { id: todos.length ? todos[todos.length - 1].id + 1 : 1, text, done: false, createdAt, updatedAt: createdAt }
  todos.push(newTodo)
  return { todo: newTodo, persisted: false }
}

const markTodoDone = async (id) => {
  const updatedAt = new Date().toISOString()
  if (usingDb && db) {
    try {
      const result = await db.query('UPDATE todos SET done = true, updated_at = $2 WHERE id = $1 RETURNING *', [id, updatedAt])
      const r = result.rows[0]
      if (!r) return { todo: null, persisted: false }
      const todo = { id: r.id, text: r.text, done: !!r.done, createdAt: r.created_at ? r.created_at.toISOString() : null, updatedAt: r.updated_at ? r.updated_at.toISOString() : updatedAt }
      return { todo, persisted: true }
    } catch (err) {
      console.error('DB query failed in markTodoDone:', err.message)
      usingDb = false
      reconnectIfNeeded()
    }
  }
  const todo = todos.find(t => t.id === id)
  if (!todo) return { todo: null, persisted: false }
  todo.done = true
  todo.updatedAt = updatedAt
  return { todo, persisted: false }
}

const deleteTodoById = async (id) => {
  if (usingDb && db) {
    try {
      const result = await db.query('DELETE FROM todos WHERE id = $1 RETURNING *', [id])
      return result.rows[0] || null
    } catch (err) {
      console.error('DB query failed in deleteTodoById:', err.message)
      usingDb = false
      reconnectIfNeeded()
      const index = todos.findIndex(t => t.id === id)
      if (index === -1) return null
      return todos.splice(index, 1)[0]
    }
  }
  const index = todos.findIndex(t => t.id === id)
  if (index === -1) return null
  return todos.splice(index, 1)[0]
}

// ---- Routes ----
app.get('/todos/status', (req, res) => {
  res.status(200).json({ todos_count: todos.length, db_connected: usingDb, nats_connected: natsReady })
})

app.get('/healthz', async (req, res) => {
  if (!db) {
    return res.status(200).json({ status: 'ok', db: 'disabled' })
  }

  try {
    await db.query('SELECT 1')
    res.status(200).json({ status: 'ok', db: 'connected' })
  } catch (err) {
    res.status(503).json({ status: 'unavailable', db: 'error', error: err.message })
  }
})

app.get('/todos', asyncHandler(async (req, res) => {
  const allTodos = await getAllTodos()
  res.status(200).json(allTodos)
}))

app.get('/todos/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' })

  const todo = await getTodoById(id)
  if (!todo) return res.status(404).json({ error: 'Todo not found' })
  res.status(200).json(todo)
}))

app.post('/todos', asyncHandler(async (req, res) => {
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'Todo text required' })
  if (text.trim().length > 140) return res.status(400).json({ error: 'Todo text cannot exceed 140 characters' })

  const { todo: newTodo, persisted } = await createTodo(text.trim())
  if (persisted) await publishEvent('todo.created', newTodo)
  else console.warn('Todo created in-memory; skipping publish to NATS')
  res.status(201).json(newTodo)
}))

app.put('/todos/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' })

  const { todo: updated, persisted } = await markTodoDone(id)
  if (!updated) return res.status(404).json({ error: 'Todo not found' })
  if (persisted) await publishEvent('todo.updated', updated)
  else console.warn('Todo updated in-memory; skipping publish to NATS')
  res.status(200).json(updated)
}))

app.delete('/todos/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' })

  const deleted = await deleteTodoById(id)
  if (!deleted) return res.status(404).json({ error: 'Todo not found' })
  res.status(204).end()
}))

// ---- Error Handlers ----
const unknownEndpoint = (req, res) => {
  res.status(404).json({ error: 'unknown endpoint' })
}

const errorHandler = (err, req, res, next) => {
  console.error(err.message)
  if (err.name === 'CastError') return res.status(400).json({ error: 'malformatted id' })
  res.status(500).json({ error: 'Internal server error' })
}

app.use(unknownEndpoint)
app.use(errorHandler)

const PORT = process.env.TODO_BACKEND_PORT
if (!PORT) throw new Error('TODO_BACKEND_PORT environment variable is required')

app.listen(PORT, () => console.log(`Todo-backend running on port ${PORT}`))