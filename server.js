const mssqlServer = require('./src/server')
const server = mssqlServer.create()
const router = mssqlServer.router({
  user: process.env.MSSQL_USERNAME || '',
  password: process.env.MSSQL_PASSWORD || '',
  server: process.env.MSSQL_SERVER || '',
  database: process.env.MSSQL_DATABASE || '',

  options: {
    encrypt: true // Use this if you're on Windows Azure
  }
})
const middlewares = mssqlServer.defaults()
const port = process.env.PORT || 8080

const fs = require('fs')
const routes = JSON.parse(fs.readFileSync('routes.json'))
const rewriter = mssqlServer.rewriter(routes)

server.use(middlewares)
server.use(rewriter)
server.use(router)

server.listen(port, () => {
  console.log('MSSQL REST Server is running on port ' + port)
})
