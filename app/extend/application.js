const path = require('path')

const CHAIN = Symbol('alvey.chain')

module.exports = {
  get chain() {
    this[CHAIN] = this[CHAIN] || this.alveyinfo.lib.Chain.get(this.config.alvey.chain)
    return this[CHAIN]
  },
  get alveyinfo() {
    return {
      lib: require(path.resolve(this.config.alveyinfo.path, 'lib')),
      rpc: require(path.resolve(this.config.alveyinfo.path, 'rpc'))
    }
  }
}
