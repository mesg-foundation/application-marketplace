exports.list = async mesg => {
  const result = await mesg.executeTaskAndWaitResult({
    serviceID: 'marketplace',
    taskKey: 'listServices',
    inputData: '{}'
  })
  return JSON.parse(result.outputData).services
}