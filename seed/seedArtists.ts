import fs from 'fs/promises'
import fetch from 'node-fetch'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID
const CF_API_TOKEN = process.env.CF_API_TOKEN

if (!YOUTUBE_API_KEY || !CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
  throw new Error('Set YOUTUBE_API_KEY, CF_ACCOUNT_ID, CF_NAMESPACE_ID, and CF_API_TOKEN env vars')
}

const KV_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values`

async function getYouTubeId(url: string): Promise<{ type: 'video' | 'playlist', id: string } | null> {
  const videoMatch = url.match(/(?:v=|youtu.be\/)([\w-]{11})/)
  if (videoMatch) return { type: 'video', id: videoMatch[1] }
  const playlistMatch = url.match(/[?&]list=([\w-]+)/)
  if (playlistMatch) return { type: 'playlist', id: playlistMatch[1] }
  return null
}

async function getAvatar({ type, id }: { type: 'video' | 'playlist', id: string }): Promise<string | null> {
  if (type === 'video') {
    // Get video details
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${YOUTUBE_API_KEY}`)
    const data = await res.json()
    return data.items?.[0]?.snippet?.thumbnails?.high?.url || null
  } else {
    // Get playlist details
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${id}&key=${YOUTUBE_API_KEY}`)
    const data = await res.json()
    return data.items?.[0]?.snippet?.thumbnails?.high?.url || null
  }
}

async function main() {
  const raw = await fs.readFile('./data.json', 'utf-8')
  const artists = JSON.parse(raw)
  let ids: number[] = []
  let nextId = 1
  for (const artist of artists) {
    const yt = await getYouTubeId(artist.youtube)
    if (!yt) continue
    const avatar = await getAvatar(yt)
    const video = yt.type === 'video' ? { youtubeId: yt.id, title: artist.name, duration: '', thumbnail: avatar } : null
    const artistObj = {
      id: nextId,
      name: artist.name,
      avatar: avatar || '',
      video
    }
    // Store in KV
    await fetch(`${KV_API}/artist:${nextId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(artistObj)
    })
    ids.push(nextId)
    nextId++
  }
  // Store artist:ids
  await fetch(`${KV_API}/artist:ids`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ids)
  })
  console.log('Seeded', ids.length, 'artists')
}

main().catch(console.error)
