const server = require('./src/server')
const app = server.create()
const router = server.router({
  user: process.env.MSSQL_USERNAME || '',
  password: process.env.MSSQL_PASSWORD || '',
  server: process.env.MSSQL_SERVER || '',
  database: process.env.MSSQL_DATABASE || '',

  options: {
    encrypt: true // Use this if you're on Windows Azure
  }
})
const middlewares = server.defaults()
const port = process.env.PORT || 8080

app.use(middlewares)
app.use(router)

app.listen(port, () => {
  console.log('MSSQL REST Server is running on port ' + port)
})
