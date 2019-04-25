const endpoint = process.env.coreAddr || 'localhost:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')
const error = require('debug')('marketplace:error')

// cache all services and service list on startup.
getServices().then(({ services }) => {
  cacheServices(services)
  services.forEach(async ({ sid }) => cacheService(sid, await getService(sid)))
})

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
    .on('data', async (event) => { 
      const { sid } = JSON.parse(event.eventData)
      cacheServices(await getServices())
      cacheService(sid, await getService(sid))
    })
    .on('error', (err) => {
      error(`err while listening event ${eventKey}:`, err)
      process.exit(1)
    })
})

// cacheService caches response for GET /services/:sid endpoints.
function cacheService(sid, service) {
  return cache('/services/'+sid, service)
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

function getService(sid) {
  return revealOutputData(mesg.executeTaskAndWaitResult({
    serviceID: 'marketplace',
    taskKey: 'getService',
    inputData: JSON.stringify({ sid })
  }))
}

function getServices() {
  return revealOutputData(mesg.executeTaskAndWaitResult({
    serviceID: 'marketplace',
    taskKey: 'listServices',
    inputData: JSON.stringify({})
  }))
}

// serve 404 for all(*) other requests.
mesg.listenEvent({ serviceID: 'http-server', eventFilter: 'request' })
  .on('data', async (event) => {
    const data = JSON.parse(event.eventData)
    const sessionID = data.sessionID
    try {
      await revealOutputData(mesg.executeTaskAndWaitResult({
        serviceID: 'http-server',
        taskKey: 'completeSession',
        inputData: JSON.stringify({ sessionID, code: 404 })
      }))
    } catch(err) {
      error('error while responding api request:', err)
    }
  })
  .on('error', (err) => {
    error('error while listening api requests:', err)
    process.exit(1)
  })

// revealOutputData parses and returns output data from successfully finished promise.
function revealOutputData(promise) {
  return promise.then(({ outputData }) => JSON.parse(outputData))
}