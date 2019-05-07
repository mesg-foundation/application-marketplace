const endpoint = process.env.coreAddr || '192.168.99.101:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')
const error = require('debug')('marketplace:error')

async function refreshAllCache() {
  const { services } = await getServices()
  const servicesToCache = []
  const promises = []
  for (const service of services) {
    const s = await getService(service.sid)
    promises.push(cacheService(s))
    servicesToCache.push(s)
  }
  await cacheServices(servicesToCache)
  await Promise.all(promises)
  debug('cache updated')
}

// cacheService caches response for GET /services/:sid endpoints.
function cacheService(service) {
  return cache('/services/' + service.sid, service)
}

// cacheServices caches response for GET /services endpoint.
function cacheServices(services) {
  return cache('/services', services)
}

// cache caches api response for endpoint with given content & 200 code.
function cache(endpoint, content) {
  mesg.executeTaskAndWaitResult({
    serviceID: 'http-server',
    taskKey: 'cache',
    inputData: JSON.stringify({
      method: 'get',
      path: endpoint,
      code: 200,
      mimeType: 'application/json',
      content: JSON.stringify(content),
    })
  })
  debug(`cached response for get ${endpoint}`)
}

async function getService(sid) {
  const { outputData } = await mesg.executeTaskAndWaitResult({
    serviceID: 'marketplace',
    taskKey: 'getService',
    inputData: JSON.stringify({ sid })
  })
  return JSON.parse(outputData)
}

async function getServices() {
  const { outputData } = await mesg.executeTaskAndWaitResult({
    serviceID: 'marketplace',
    taskKey: 'listServices',
    inputData: JSON.stringify({})
  })
  return JSON.parse(outputData)
}

refreshAllCache()

  // update caches by watching marketplace events.
  ;[
    'serviceCreated',
    'serviceOfferCreated',
    'serviceOfferDisabled',
    'serviceOwnershipTransferred',
    'servicePurchased',
    'serviceVersionCreated'
  ].forEach((eventKey) => {
    mesg.listenEvent({ serviceID: 'marketplace', eventFilter: eventKey })
      .on('data', refreshAllCache)
      .on('error', (err) => {
        error(`err while listening event ${eventKey}:`, err)
        process.exit(1)
      })
  })

// serve 404 for all(*) other requests.
mesg.listenEvent({ serviceID: 'http-server', eventFilter: 'request' })
  .on('data', async (event) => {
    const data = JSON.parse(event.eventData)
    const sessionID = data.sessionID
    try {
      await mesg.executeTaskAndWaitResult({
        serviceID: 'http-server',
        taskKey: 'completeSession',
        inputData: JSON.stringify({ sessionID, code: 404 })
      })
    } catch (err) {
      error('error while responding api request:', err)
    }
  })
  .on('error', (err) => {
    error('error while listening api requests:', err)
    process.exit(1)
  })