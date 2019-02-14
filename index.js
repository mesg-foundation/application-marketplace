const endpoint = process.env.coreAddr || 'localhost:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace')
const error = require('debug')('marketplace:error')
const { list } = require('./funcs/marketplace')
const { listenRequests, response } = require('./funcs/http-server')

const listServicesEndpoint = '/services'

// serve JSON APIs.
listenRequests(mesg)
  .on('data', async (event) => {
    const data = JSON.parse(event.eventData)
    const method = data.method
    const path = data.path
    const body = data.body ? JSON.parse(data.body) : {}
    const sessionID = data.sessionID

    try {
      await handleRequest({ sessionID, method, path, body })
    } catch(err) {
      error('error while responding api request:', err)
    }
  })
  .on('error', (err) => {
    error('error while listening api requests:', err)
    process.exit(1)
  })

async function handleRequest({ sessionID, method, path, body }) {
  if (method !== 'GET') {
    await response(mesg, { sessionID, code: 404 })
    return
  }

  switch (path) {
    case listServicesEndpoint:
      debug(`requested ${listServicesEndpoint}: ${sessionID}`)
      await response(mesg, {
        sessionID,
        mimeType: 'application/json',
        content: JSON.stringify(await list(mesg))
      })
      debug(`completed ${listServicesEndpoint}: ${sessionID}`)
      return
  }

  await response(mesg, { sessionID, code: 404 })
}