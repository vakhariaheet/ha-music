import { Hono } from 'hono'
import apiRoutes from './routes/artistRoutes'
import type { Env } from './controllers/artistController';
import { cors } from 'hono/cors';
const app = new Hono<{ Bindings: Env }>()

app.use('*', cors());
app.route('/api', apiRoutes)


app.get('/', (c) => {
  return c.text('Hello Hono!')
})
export default app
