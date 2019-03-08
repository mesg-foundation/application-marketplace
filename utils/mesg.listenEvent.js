module.exports = (mesg) => (serviceID, eventFilter) => {
  return mesg.listenEvent({ serviceID, eventFilter })
}