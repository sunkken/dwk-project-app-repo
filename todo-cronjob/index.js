const path = require('path')

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
}

async function getRandomWikiUrl() {
  const res = await fetch('https://en.wikipedia.org/wiki/Special:Random', {
    method: 'HEAD',
    redirect: 'manual'
  })

  const location = res.headers.get('location')
  if (!location) throw new Error('No redirect location header')

  return location
}

async function createTodo(url) {
  const backend = process.env.TODO_BACKEND_URL
  if (!backend) throw new Error('Missing env: TODO_BACKEND_URL')

  const text = `Read ${url}`

  const res = await fetch(`${backend}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Backend error: ${res.status} ${t}`)
  }

  console.log('Todo created:', await res.json())
}

async function main() {
  try {
    const url = await getRandomWikiUrl()

    if (process.env.NODE_ENV !== 'production') {
      console.log('Generated random article URL:', url)
      console.log('Dev mode: not sending to backend')
      return
    }

    await createTodo(url)
  } catch (err) {
    console.error('CronJob failed:', err)
    process.exit(1)
  }
}

main()