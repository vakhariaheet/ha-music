import type { Context } from 'hono'
import type { KVNamespace } from '@cloudflare/workers-types'

export type Env = {
  HA_MUSIC_DB: KVNamespace
  YOUTUBE_API_KEY: string;
  HOME_ASSISTANT_TOKEN: string;
  HOME_ASSISTANT_URL: string;
}

export async function getArtistIds(env: Env): Promise<number[]> {
  const ids = await env.HA_MUSIC_DB.get('artist:ids')
  return ids ? JSON.parse(ids) : []
}

export async function setArtistIds(env: Env, ids: number[]) {
  await env.HA_MUSIC_DB.put('artist:ids', JSON.stringify(ids))
}

export async function getAllArtists(c: Context<{ Bindings: Env }>) {
  const env = c.env
  const ids = await getArtistIds(env)
  const artists = await Promise.all(
    ids.map(async (id) => {
      const data = await env.HA_MUSIC_DB.get(`artist:${id}`)
      return data ? JSON.parse(data) : null
    })
  )
  return c.json(artists.filter(a => a?.name).toSorted((a, b) => a.name.localeCompare(b.name)))
}

export async function searchArtists(c: Context<{ Bindings: Env }>) {
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
}

export async function addArtist(c: Context<{ Bindings: Env }>) {
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
  await setArtistIds(env, [ ...ids, nextId ])
  return c.json(artist, 201)
}

export async function editArtist(c: Context<{ Bindings: Env }>) {
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
}

export async function deleteArtist(c: Context<{ Bindings: Env }>) {
  const env = c.env
  const id = Number(c.req.param('id'))
  const ids = await getArtistIds(env)
  if (!ids.includes(id)) return c.json({ error: 'Not found' }, 404)
  await env.HA_MUSIC_DB.delete(`artist:${id}`)
  await setArtistIds(env, ids.filter(i => i !== id))
  return c.json({ success: true })
}

export async function playArtist(c: Context<{ Bindings: Env }>) {
  const env = c.env
  const id = Number(c.req.param('id'))
  const data = JSON.parse(await env.HA_MUSIC_DB.get(`artist:${id}`) ?? '{}');
  if (!data) return c.json({ error: 'Not found' }, 404)
  if (!data.video) return c.json({ error: 'No video available' }, 400)
  await fetch(`${env.HOME_ASSISTANT_URL}/services/media_player/turn_on`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.HOME_ASSISTANT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      entity_id: 'media_player.apple_tv'
    })
  })
  const playResponse = await fetch(`${env.HOME_ASSISTANT_URL}/services/media_player/play_media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.HOME_ASSISTANT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      entity_id: 'media_player.apple_tv',
      media_content_type: 'url',
      media_content_id: `youtube://${data.video}&start=0`
    })
  })
  console.log('Play response:', playResponse.status, await playResponse.json())
  return c.json({ success: true, message: 'Playing on TV' })
}

export async function youtubeSearch(c: Context<{ Bindings: Env }>) {
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
  console.log('YouTube search results:', detailsData.items.length, 'items')
  console.log(JSON.stringify(detailsData, null, 2))
  const results = detailsData.items.map((item: any) => ({
    youtubeId: item.id,
    title: item.snippet.title,
    duration: item.contentDetails.duration,
    thumbnail: item.snippet.thumbnails.high.url
  }))
  return c.json(results)
}

export async function bulkAddArtists(c: Context<{ Bindings: Env }>) {
  const env = c.env
  const apiKey = env.YOUTUBE_API_KEY
  if (!apiKey) return c.json({ error: 'YouTube API key not set' }, 500)
  const body = await c.req.json() as Array<{ name: string, youtube: string }>
  let ids = await getArtistIds(env)
  const added: any[] = []

  for (const entry of body) {
    let videoId = ''
    let avatar = ''
    let videoURL: string = ''
    // Extract videoId from URL (supports playlist or video)
    const url = new URL(entry.youtube)
    if (url.searchParams.has('list')) {
      // Playlist: get first video
      const playlistId = url.searchParams.get('list')
      const playlistApi = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=1&playlistId=${playlistId}&key=${apiKey}`
      const playlistRes = await fetch(playlistApi)
      const playlistJson = await playlistRes.json() as any
      if (playlistJson.items && playlistJson.items.length > 0) {
        videoId = playlistJson.items[ 0 ].snippet.resourceId.videoId
        avatar = playlistJson.items[ 0 ].snippet.thumbnails.high.url
        videoURL = entry.youtube
      }
    } else if (url.searchParams.has('v')) {
      // Video
      videoId = url.searchParams.get('v') || ''
    } else {
      // Try to extract videoId from pathname
      const match = entry.youtube.match(/(?:youtu.be\/|youtube.com\/watch\?v=)([\w-]+)/)
      if (match) videoId = match[ 1 ]
    }
    if (videoId && !videoURL) {
      // Fetch video details
      const videoApi = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
      const videoRes = await fetch(videoApi)
      const videoJson = await videoRes.json() as any
      if (videoJson.items && videoJson.items.length > 0) {
        const v = videoJson.items[ 0 ]
        avatar = v.snippet.thumbnails.high.url
        videoURL = entry.youtube
      }
    }
    if (!videoURL) continue // skip if no video found
    const nextId = ids.length ? Math.max(...ids) + 1 : 1

    const artist = {
      id: nextId,
      name: entry.name,
      avatar,
      video: videoURL
    }
    await env.HA_MUSIC_DB.put(`artist:${nextId}`, JSON.stringify(artist))
    ids.push(nextId)
    added.push(artist)
  }
  await setArtistIds(env, ids)
  return c.json({ added })
}

export async function getYouTubeVideoDetails(c: Context<{ Bindings: Env }>) {
  const env = c.env
  const apiKey = env.YOUTUBE_API_KEY
  const url = c.req.query('url')
  if (!apiKey) return c.json({ error: 'YouTube API key not set' }, 500)
  if (!url) return c.json({ error: 'Missing url param' }, 400)

  let videoId = ''
  try {
    const ytUrl = new URL(url)
    if (ytUrl.searchParams.has('v')) {
      videoId = ytUrl.searchParams.get('v') || ''
    } else {
      // Try to extract videoId from pathname (e.g. youtu.be/VIDEOID)
      const match = url.match(/(?:youtu.be\/|youtube.com\/watch\?v=)([\\w-]+)/)
      if (match) videoId = match[1]
    }
    if (!videoId) return c.json({ error: 'Invalid YouTube URL' }, 400)

    const api = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
    const res = await fetch(api)
    const data = await res.json() as any
    if (!data.items || !data.items.length) return c.json({ error: 'Video not found' }, 404)
    const v = data.items[0]
    return c.json({
      youtubeId: v.id,
      title: v.snippet.title,
      thumbnail: v.snippet.thumbnails.high.url,
      duration: v.contentDetails.duration
    })
  } catch (e) {
    return c.json({ error: 'Invalid YouTube URL' }, 400)
  }
}