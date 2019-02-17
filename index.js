const endpoint = process.env.coreAddr || 'localhost:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')
const error = require('debug')('marketplace:error')
const { list } = require('./funcs/marketplace')
const {
  listenRequests,
  response,
  cacheResponse,
} = require('./funcs/http-server')

// cacheServicesResponse caches response for /services JSON API.
async function cacheServicesResponse() {
  debug('caching response for services...')
  await cacheResponse(mesg, {
    method: 'get',
    path: '/services',
    code: 200,
    mimeType: 'application/json',
    content: JSON.stringify(await list(mesg))
  })
  debug('response cached for services')
}

cacheServicesResponse()
setInterval(cacheServicesResponse, 60 * 1000 * 2)

// serve 404 for * JSON API.
listenRequests(mesg)
  .on('data', async (event) => {
    const data = JSON.parse(event.eventData)
    const sessionID = data.sessionID
    try {
      await response(mesg, { sessionID, code: 404 })
    } catch(err) {
      error('error while responding api request:', err)
    }
  })
  .on('error', (err) => {
    error('error while listening api requests:', err)
    process.exit(1)
  })
