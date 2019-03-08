const endpoint = process.env.coreAddr || 'localhost:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')
const error = require('debug')('marketplace:error')

// update services cache on startup.
cacheServicesResponse()

// update services cache by watching marketplace events.
;[
  'serviceCreated',
  'serviceOfferCreated',
  'serviceOfferDisabled',
  'serviceOwnershipTransferred',
  'servicePurchased',
  'serviceVersionCreated'
].forEach((eventKey) => {
  mesg.listenEvent({ serviceID: 'marketplace', eventFilter: eventKey })
    .on('data', cacheServicesResponse)
    .on('error', (err) => {
      error(`err while listening event ${eventKey}:`, err)
      process.exit(1)
    })
})

// cacheServicesResponse caches response for /services JSON API.
async function cacheServicesResponse() {
  debug('caching response for services...')
  await revealOutputData(mesg.executeTaskAndWaitResult({
    serviceID: 'http-server',
    taskKey: 'cache',
    inputData: JSON.stringify({
      method: 'get',
      path: '/services',
      code: 200,
      mimeType: 'application/json',
      content: JSON.stringify(await revealOutputData(mesg.executeTaskAndWaitResult({
        serviceID: 'marketplace',
        taskKey: 'listServices',
        inputData: JSON.stringify({})
      })))
    })
  }))
  debug('response cached for services')
}

// serve 404 for * JSON API.
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