const express = require('express')
const methodOverride = require('method-override')
const _ = require('lodash')
const sql = require('mssql')
const bodyParser = require('../body-parser')
const plural = require('./plural')
const nested = require('./nested')

module.exports = (config, opts = { foreignKeySuffix: '_id' }) => {
  // Create router
  const router = express.Router()

  // Add middlewares
  router.use(methodOverride())
  router.use(bodyParser)

  // Expose render
  router.render = (req, res) => {
    res.jsonp(res.locals.data)
  }

  // Handle /:parent/:parentId/:resource
  router.use(nested(opts))
  ;(async () => {
    try {
      console.log('Connecting to database...')
      let db = await sql.connect(config)

      // get tables list
      let result = await db
        .request()
        .query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES')
      let tables = []
      if (result.recordset !== undefined)
        tables = result.recordset.map(v => v.TABLE_NAME)

      tables = _.filter(tables, table => {
        if (table === 'database_firewall_rules') return false
        if (table[0] === '_') return false
        return true
      })

      // Expose database
      router.db = db
      router.tables = tables

      // GET /db
      router.get('/db', async (req, res) => {
        let result = {}
        _.forEach(tables, t => {
          result[t] = []
        })
        res.jsonp(result)
      })

      // GET /:resource
      tables.forEach(table => {
        router.use(`/${table}`, plural(db, table, opts))
        console.log(`ADD RESOURCE /${table}`)
      })

      router.use((req, res) => {
        if (!res.locals.data) {
          res.status(404)
          res.locals.data = {}
        }

        router.render(req, res)
      })

      router.use((err, req, res, next) => {
        console.error(err.stack)
        res.status(500).send(err.stack)
      })
    } catch (err) {
      // ... error checks
      console.log(err)
    }
  })()

  return router
}
