import { Hono } from 'hono'
import { renderer } from './renderer'
import type { KVNamespace } from '@cloudflare/workers-types'
// Define Env type for Hono context
interface Env {
  HA_MUSIC_DB: KVNamespace
  YOUTUBE_API_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

app.use(renderer)

// Helper to get all artist IDs
async function getArtistIds(env: Env): Promise<number[]> {
  const ids = await env.HA_MUSIC_DB.get('artist:ids')
  return ids ? JSON.parse(ids) : []
}

// Helper to set all artist IDs
async function setArtistIds(env: Env, ids: number[]) {
  await env.HA_MUSIC_DB.put('artist:ids', JSON.stringify(ids))
}

// GET all artists
app.get('/api/artists', async (c) => {
  const env = c.env
  const ids = await getArtistIds(env)
  const artists = await Promise.all(
    ids.map(async (id) => {
      const data = await env.HA_MUSIC_DB.get(`artist:${id}`)
      return data ? JSON.parse(data) : null
    })
  )
  return c.json(artists.filter(a => a?.name))
})

// Search artists
app.get('/api/artists/search', async (c) => {
  const env = c.env
  const q = (c.req.query('q') ?? '').toLowerCase()
  const ids = await getArtistIds(env)
  const artists = await Promise.all(
    ids.map(async (id) => {
      const data = await env.HA_MUSIC_DB.get(`artist:${id}`)
      return data ? JSON.parse(data) : null
    })
  )
  const filtered = artists.filter(a => a?.name?.toLowerCase().includes(q))
  return c.json(filtered)
})

// Add new artist
app.post('/api/artists', async (c) => {
  const env = c.env
  const body = await c.req.json()
  const ids = await getArtistIds(env)
  const nextId = ids.length ? Math.max(...ids) + 1 : 1
  const artist = {
    id: nextId,
    name: body.name,
    avatar: body.avatar,
    video: body.video ?? null // Only one video
  }
  await env.HA_MUSIC_DB.put(`artist:${nextId}`, JSON.stringify(artist))
  await setArtistIds(env, [...ids, nextId])
  return c.json(artist, 201)
})

// Edit artist
app.put('/api/artists/:id', async (c) => {
  const env = c.env
  const id = Number(c.req.param('id'))
  const data = await env.HA_MUSIC_DB.get(`artist:${id}`)
  if (!data) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json()
  const updated = { ...JSON.parse(data), ...body }
  // Ensure only one video
  if (body.video) updated.video = body.video
  await env.HA_MUSIC_DB.put(`artist:${id}`, JSON.stringify(updated))
  return c.json(updated)
})

// Delete artist
app.delete('/api/artists/:id', async (c) => {
  const env = c.env
  const id = Number(c.req.param('id'))
  const ids = await getArtistIds(env)
  if (!ids.includes(id)) return c.json({ error: 'Not found' }, 404)
  await env.HA_MUSIC_DB.delete(`artist:${id}`)
  await setArtistIds(env, ids.filter(i => i !== id))
  return c.json({ success: true })
})

// Play artist on TV (stub for Home Assistant integration)
app.post('/api/artists/:id/play', async (c) => {
  const env = c.env
  const id = Number(c.req.param('id'))
  const data = await env.HA_MUSIC_DB.get(`artist:${id}`)
  if (!data) return c.json({ error: 'Not found' }, 404)
  // Here you would call Home Assistant API to play the artist's songs
  // For now, just return success
  return c.json({ success: true, message: 'Playing on TV' })
})

// YouTube search (real API)
app.get('/api/youtube/search', async (c) => {
  const env = c.env
  const q = c.req.query('q') ?? ''
  const apiKey = env.YOUTUBE_API_KEY
  if (!apiKey) return c.json({ error: 'YouTube API key not set' }, 500)
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(q)}&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return c.json({ error: 'YouTube API error' }, 500)
  const data = (await res.json()) as any
  // Get video details (duration)
  const videoIds = data.items.map((item: any) => item.id.videoId).join(',')
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${apiKey}`
  const detailsRes = await fetch(detailsUrl)
  const detailsData = (await detailsRes.json()) as any
  const results = detailsData.items.map((item: any) => ({
    youtubeId: item.id,
    title: item.snippet.title,
    duration: item.contentDetails.duration,
    thumbnail: item.snippet.thumbnails.high.url
  }))
  return c.json(results)
})

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})


export default app
