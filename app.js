import './env'
import Koa from 'koa'
import json from 'koa-json'
import logger from 'koa-logger'
import auth from './server/routes/auth.js'
import api from './server/routes/api.js'
import jwt from 'koa-jwt'
import path from 'path'
import fs from 'fs'
import serve from 'koa-static'
import koaRouter from 'koa-router'
import koaBodyparser from 'koa-bodyparser'
import { createBundleRenderer } from 'vue-server-renderer'
import favicon from 'koa-favicon'

const isProd = process.env.NODE_ENV === 'production'
const app = new Koa()
const router = koaRouter()
const resolve = file => path.resolve(__dirname, file)

function createRenderer (bundle, options) {
  return createBundleRenderer(bundle, Object.assign(options, {
    runInNewContext: false
  }))
}

let renderer
const templatePath = resolve('./index.html')

let port = process.env.PORT || 8889

if (isProd) {
  const template = fs.readFileSync(templatePath, 'utf-8')
  const bundle = require('./dist/vue-ssr-server-bundle.json')
  const clientManifest = require('./dist/vue-ssr-client-manifest.json')
  renderer = createRenderer(bundle, {
    template,
    clientManifest
  })
  app.use(serve(path.resolve('dist'), {
    hidden: 'index.html'
  }))
} else {
  require('./build/setup-dev-server')(app, (bundle, template) => {
    renderer = createRenderer(bundle, { template })
  })
}

app.use(koaBodyparser())
app.use(json())
app.use(logger())
app.use(favicon(path.resolve(__dirname, 'src/assets/logo.png')))

app.use(async function (ctx, next) {
  let start = new Date()
  await next()
  let ms = new Date() - start
  console.log('%s %s - %s', ctx.method, ctx.url, ms, 'hello')
})

app.use(async function (ctx, next) {  // If JWT validation fails, validation failure information is returned
  try {
    await next()
  } catch (err) {
    if (err.status === 401) {
      ctx.status = 401
      ctx.body = {
        success: false,
        token: null,
        info: 'Protected resource, use Authorization header to get access'
      }
    } else {
      throw err
    }
  }
})

app.on('error', function (err, ctx) {
  console.log('server error', err)
})

router.use('/auth', auth.routes()) // Mount to koa-router, at the same time will make all auth request path in front of the request path '/ auth'.
router.use('/api', jwt({secret: 'vue-koa-demo'}), api.routes()) // All / api / header requests need to be jwt verified.

app.use(router.routes()) // Mount routing rules to Koa.
// app.use(historyApiFallback())
// app.use(serve(path.resolve('dist'))) // The webpack packaged project directory as the Koa static file service directory

router.get('*', async (ctx, next) => {
  return render(ctx, next)
})

const render = async (ctx, next) => {
  if (!renderer) {
    ctx.body = 'waiting for compilation... refresh in a moment.'
    return ctx.body
  } else {
    let req = ctx.req
    ctx.type = 'html'
    const s = Date.now()
    let context = { url: req.url }
    ctx.body = await renderToStringPromise(context, s)
    return ctx.body
  }
}

function renderToStringPromise (context, s) {
  return new Promise((resolve, reject) => {
    renderer.renderToString(context, (err, html) => {
      if (err) {
        console.log(err)
      }
      if (!isProd) {
        console.log(`whole request: ${Date.now() - s}ms`)
      }
      resolve(html)
    })
  })
}

app.use(router.routes()) // Mount routing rules to Koa.
app.use(router.allowedMethods())

export default app.listen(port, () => {
  console.log(`Koa is listening in ${port}`)
})
