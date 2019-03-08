const endpoint = process.env.coreAddr || 'localhost:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')
const error = require('debug')('marketplace:error')
const executeTask = require('./utils/mesg.executeTask')(mesg)
const listenEvent = require('./utils/mesg.listenEvent')(mesg)

// update services cache on startup.
cacheServicesResponse()

// update services cache every 2 mins.
setInterval(cacheServicesResponse, 60 * 1000 * 2)

// update services cache by watching marketplace events.
;[
  'serviceCreated',
  'serviceOfferCreated',
  'serviceOfferDisabled',
  'serviceOwnershipTransferred',
  'servicePurchased',
  'serviceVersionCreated'
].forEach((eventKey) => {
  listenEvent('marketplace', eventKey)
    .on('data', cacheServicesResponse)
    .on('error', (err) => {
      error(`err while listening event ${eventKey}:`, err)
      process.exit(1)
    })
})

// cacheServicesResponse caches response for /services JSON API.
async function cacheServicesResponse() {
  debug('caching response for services...')
  await executeTask('http-server', 'cache', {
    method: 'get',
    path: '/services',
    code: 200,
    mimeType: 'application/json',
    content: JSON.stringify(await executeTask('marketplace', 'listServices'))
  })
  debug('response cached for services')
}

// serve 404 for * JSON API.
listenEvent('http-server', 'request')
  .on('data', async (event) => {
    const data = JSON.parse(event.eventData)
    const sessionID = data.sessionID
    try {
      await executeTask('http-server', 'completeSession', { sessionID, code: 404 })
    } catch(err) {
      error('error while responding api request:', err)
    }
  })
  .on('error', (err) => {
    error('error while listening api requests:', err)
    process.exit(1)
  })
