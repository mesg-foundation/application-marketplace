const endpoint = process.env.ENGINE_ENDPOINT || process.env.coreAddr
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')

const handleError = err => {
  console.error(err)
  process.exit(1)
}

// cache caches api response for endpoint with given content & 200 code.
const cache = async (endpoint, content) => mesg.executeTaskAndWaitResult({
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

const fetch = async (task, params = {}) => {
  const { outputData } = await mesg.executeTaskAndWaitResult({
    serviceID: 'marketplace',
    taskKey: task,
    inputData: JSON.stringify(params)
  })
  return JSON.parse(outputData)
}

const refreshAllCache = async () => {
  const { services } = await fetch('listServices')
  const servicesToCache = []
  for (const service of services) {
    const srv = await fetch('getService', { sid: service.sid })
    await cache(`/services/${srv.sid}`, srv)
    debug(`CACHE /services/${srv.sid}`)
    servicesToCache.push(srv)
  }
  await cache('/services', servicesToCache)
  debug('CACHE /services')
}

const main = async () => {
  await refreshAllCache()

  const events = [
    'serviceCreated',
    'serviceOfferCreated',
    'serviceOfferDisabled',
    'serviceOwnershipTransferred',
    'servicePurchased',
    'serviceVersionCreated'
  ]
  events.forEach((eventKey) => {
    mesg.listenEvent({ serviceID: 'marketplace', eventFilter: eventKey })
      .on('data', refreshAllCache)
      .on('error', handleError)
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
        console.error('error while responding api request:', err)
      }
    })
    .on('error', handleError)
}

try {
  main()
} catch (e) {
  console.error(e)
  process.exit(0)
}