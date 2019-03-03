const endpoint = process.env.coreAddr || 'localhost:50052'
const mesg = require('mesg-js').application({ endpoint })
const debug = require('debug')('marketplace') // use log service instead
const error = require('debug')('marketplace:error')
const { parse } = require('./utils/json')
const executeTask = require('./utils/mesg.executeTask')(mesg)
const listenEvent = require('./utils/mesg.listenEvent')(mesg)

// serve GraphQL API for services.
listenEvent('graphql', 'query')
  .on('data', async ({ eventData }) => {
    let { sessionID, fields } = parse(eventData)
    let rootField = fields[0]

    // list of selected fields by the GraphQL query.
    const project = await revealData(executeTask('graphql-fields-to-mongo-selections', 'convert', {
      fields: rootField.fields
    }))

    // base mongo select query for aggregate task.
    const baseQuery = {
      collection: 'services',
      project,
      noID: true,
      lookups: [
        { field: 'sid', collection: 'versions' },
        { field: 'sid', collection: 'offers' },
        { field: 'sid', collection: 'purchases' }
      ]
    }

    // get GraphQL query variables.
    const { sid, search, limit, offset } = await revealData(executeTask('objects', 'value', {
      sources: rootField.args || [ ],
      match: { field: 'name', any: true },
      from: 'value'
    }))

    // create a sub query for aggregate task depending on requested GraphQL endpoint.
    const subQuery = await revealData(executeTask('logic', 'pick', {
      oneOf: [ {
          is: rootField.name,
          equal: 'service',
          use: { one: true, match: { sid } }
        }, {
          is: rootField.name,
          equal: 'services',
          use: {
            match: { sid: { $regex: search || '', $options: 'i' } },
            limit: parseInt(limit),
            offset: parseInt(offset),
            sort: { createTime: -1 }
          }
        }, {
          is: rootField.name,
          equal: 'recentlyUpdatedServices',
          use: { limit: 10, sort: { updatedAt: -1 } }
        } ]
    }))

    // build input data of aggregate task.
    const query = await revealData(executeTask('objects', 'merge', {
      sources: [ baseQuery, subQuery ]
    }))

    // get services from mongo.
    const services = await revealData(executeTask('mongo', 'aggregate', query))

    // response GraphQL query request with services.
    await executeTask('graphql', 'completeQuery', {sessionID, data: { [rootField.name]: services } })
  })
  .on('error', (err) => {
    error(err)
    process.exit(1)
  })

// sync entire services from marketplace service to database.
executeTask('marketplace', 'listServices')
  .then(async ({ services }) => {
    const source = services, flatten = true
    const [ _services, _versions, _offers, _purchases ] = await Promise.all([
      revealData(executeTask('objects', 'select', { source, fields: ['sid', 'sidHash', 'createTime', 'owner'] })),
      revealData(executeTask('objects', 'select', { source, flatten, fields: ['sid', 'versions.*'] })),
      revealData(executeTask('objects', 'select', { source, flatten, fields: ['sid', 'offers.*'] })),
      revealData(executeTask('objects', 'select', { source, flatten, fields: ['sid', 'purchases.*'] }))
    ])
    return Promise.all([
      executeTask('mongo', 'write', { collection: 'services', data: _services, uniqueFields: ['sid'] }),
      executeTask('mongo', 'write', { collection: 'versions', data: _versions, uniqueFields: ['hash'] }),
      executeTask('mongo', 'write', { collection: 'offers', data: _offers, uniqueFields: ['index'] }),
      executeTask('mongo', 'write', { collection: 'purchases', data: _purchases, uniqueFields: ['purchaser'] })
    ])
  })
  .then(() => debug('service list synced') )
  .catch((err) => error(err))

function revealData(promise) {
  return promise.then(({ data }) => data)
}