import { Hono } from 'hono'
import type { Env } from '../controllers/artistController'
import {
  getAllArtists,
  searchArtists,
  addArtist,
  editArtist,
  deleteArtist,
  playArtist,
  youtubeSearch,
  bulkAddArtists,
  getYouTubeVideoDetails
} from '../controllers/artistController'

const artistRoutes = new Hono<{ Bindings: Env }>()

artistRoutes.get('/artists', getAllArtists)
artistRoutes.get('/artists/search', searchArtists)
artistRoutes.post('/artists', addArtist)
artistRoutes.put('/artists/:id', editArtist)
artistRoutes.delete('/artists/:id', deleteArtist)
artistRoutes.post('/artists/:id/play', playArtist)
artistRoutes.get('/youtube/search', youtubeSearch)
artistRoutes.post('/artists/bulk', bulkAddArtists)
artistRoutes.get('/youtube/video', getYouTubeVideoDetails)
export default artistRoutes
