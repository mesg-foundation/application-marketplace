module.exports = (mesg) => async (serviceID, taskKey, data) => {
  const result = await mesg.executeTaskAndWaitResult({
    serviceID,
    taskKey,
    inputData: JSON.stringify(data || {})
  })
  return JSON.parse(result.outputData)
}