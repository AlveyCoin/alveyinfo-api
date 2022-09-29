const path = require('path')

exports.security = {
  domainWhiteList: ['http://localhost']  // CORS whitelist sites
}
// or
exports.cors = {
  origin: '*'  // Access-Control-Allow-Origin: *
}

exports.sequelize = {
  logging: false  // disable sql logging
}

exports.sequelize = { // UPDATE DBNAME, USERNAME and PASSWORD here.
dialect: 'mysql',
database: 'explorer',
host: 'localhost',
port: 3306,
username: 'alvey',
password: 'password'
}

exports.alvey = {
  chain: 'mainnet'  // Update this to the correct network
}

exports.alveyinfo = {
path: path.resolve('..', 'alveyinfo'),
port: 3001,
rpc: {
  protocol: 'http',
  host: 'localhost',
  port: 3889, // RPC PORT
  user: 'user', // RPC Username
  password: 'password' // RPC Password
}
}
