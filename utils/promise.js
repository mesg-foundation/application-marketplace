// revealData resolves promise with content of 'data' field of successful promises.
exports.revealData = (promise) => {
  return promise.then(({ data }) => data)
}