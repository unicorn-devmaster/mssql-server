const express = require('express')
const _ = require('lodash')
const squel = require('squel').useFlavour('mssql')
const delay = require('./delay')

module.exports = (db, name, opts) => {
  // Create router
  const router = express.Router()
  router.use(delay)

  let idField = 'id'

  // get fields list
  let columns = []
  let sql = squel
    .select()
    .field('COLUMN_NAME')
    .from('INFORMATION_SCHEMA.COLUMNS')
    .where('TABLE_NAME = ?', name)
    .toString()
  // console.log(sql)

  db.request().query(sql, (err, result) => {
    if (err) return
    if (result.recordset !== undefined)
      columns = result.recordset.map(v => v.COLUMN_NAME)
  })

  // // Embed function used in GET /name and GET /name/id
  // function embed(resource, e) {
  //   e &&
  //     [].concat(e).forEach(externalResource => {
  //       if (db.get(externalResource).value) {
  //         const query = {}
  //         const singularResource = pluralize.singular(name)
  //         query[`${singularResource}${opts.foreignKeySuffix}`] = resource.id
  //         resource[externalResource] = db
  //           .get(externalResource)
  //           .filter(query)
  //           .value()
  //       }
  //     })
  // }

  // // Expand function used in GET /name and GET /name/id
  // function expand(resource, e) {
  //   e &&
  //     [].concat(e).forEach(innerResource => {
  //       const plural = pluralize(innerResource)
  //       if (db.get(plural).value()) {
  //         const prop = `${innerResource}${opts.foreignKeySuffix}`
  //         resource[innerResource] = db
  //           .get(plural)
  //           .getById(resource[prop])
  //           .value()
  //       }
  //     })
  // }

  function queryRequest(query) {
    let sql = query.toString()
    console.log(sql)

    let request = db.request()
    return request.query(sql)
  }

  function queryResponseAndNext(query, req, res, next, isSingular = false) {
    let sql = query.toString()
    console.log(sql)

    let request = db.request()
    request.query(sql, (err, result) => {
      if (err) {
        console.log(err)

        res.locals.data = {}
        res.status(500)
        return
      }

      if (isSingular && result.recordset) {
        if (result.recordset.length > 0) {
          res.locals.data = result.recordset[0]
        } else {
          res.locals.data = {}
          res.status(404).send('Resource unavailable.')
          return
        }
      } else {
        res.locals.data = result.recordset
      }

      next()
    })
  }

  // GET /name
  // GET /name?q=
  // GET /name?attr=&attr=
  // GET /name?_end=&
  // GET /name?_start=&_end=&
  // GET /name?_embed=&_expand=
  function list(req, res, next) {
    let query = squel.select().from(name)

    // Remove q, _start, _end, ... from req.query to avoid filtering using those
    // parameters
    // let q = req.query.q
    let _start = req.query._start
    let _end = req.query._end
    let _page = req.query._page
    let _sort = req.query._sort
    let _order = req.query._order
    let _limit = req.query._limit
    // let _embed = req.query._embed
    // let _expand = req.query._expand
    delete req.query.q
    delete req.query._start
    delete req.query._end
    delete req.query._sort
    delete req.query._order
    delete req.query._limit
    delete req.query._embed
    delete req.query._expand

    // Automatically delete query parameters that can't be found
    // in the database
    Object.keys(req.query).forEach(query => {
      if (query === 'callback') return
      if (query[0] === '_') return
      if (columns.length === 0) return

      const path = query
        .replace(/(_lt|_gt|_lte|_gte|_ne|_like|_in)$/, '')
        .toLowerCase()
      const isColumn =
        _.filter(columns, column => column.toLowerCase() === path).length > 0
      if (!isColumn) {
        // console.log('DELETE ' + query)
        delete req.query[query]
      }
    })

    // if (q) {
    //   // Full-text search
    //   if (Array.isArray(q)) {
    //     q = q[0]
    //   }

    //   q = q.toLowerCase()

    //   chain = chain.filter(obj => {
    //     for (let key in obj) {
    //       const value = obj[key]
    //       if (db._.deepQuery(value, q)) {
    //         return true
    //       }
    //     }
    //   })
    // }

    Object.keys(req.query).forEach(key => {
      // Don't take into account JSONP query parameters
      // jQuery adds a '_' query parameter too
      if (key !== 'callback' && key !== '_') {
        // Always use an array, in case req.query is an array
        const arr = [].concat(req.query[key])

        arr.forEach(function(value) {
          const isDifferent = /_ne$/.test(key)
          const isRange =
            /_lt$/.test(key) ||
            /_gt$/.test(key) ||
            /_lte$/.test(key) ||
            /_gte$/.test(key)
          const isLike = /_like$/.test(key)
          const isIn = /_in$/.test(key)
          const path = key.replace(/(_lt|_gt|_lte|_gte|_ne|_like|_in)$/, '')

          if (isRange) {
            const op = /_lt$/.test(key)
              ? '<'
              : /_gt$/.test(key)
              ? '>'
              : /_lte$/.test(key)
              ? '<='
              : '>='
            query.where(`${path} ${op} ?`, value)
          } else if (isDifferent) {
            query.where(`${path} != ?`, value)
          } else if (isLike) {
            query.where(`${path} LIKE ?`, value)
          } else if (isIn) {
            query.where(`${path} IN ?`, value.split(','))
          } else {
            query.where(`${path} = ?`, value)
          }
        })
      }
    })

    // Sort
    var hasOrder = false
    if (_sort) {
      const _sortSet = _sort.split(',')
      const _orderSet = (_order || '').split(',').map(s => s.toLowerCase())
      _.forEach(_sortSet, (s, i) =>
        query.order(s, _orderSet[i] ? _orderSet[i] === 'asc' : null)
      )
      hasOrder = _sortSet.length > 0
    }

    // // Slice result
    // if (_end || _limit || _page) {
    //   res.setHeader('X-Total-Count', chain.size())
    //   res.setHeader(
    //     'Access-Control-Expose-Headers',
    //     `X-Total-Count${_page ? ', Link' : ''}`
    //   )
    // }

    if (_page) {
      _page = parseInt(_page, 10)
      _page = _page >= 1 ? _page : 1
      _limit = parseInt(_limit, 10) || 10
      if (!hasOrder) query.order(idField)
      query.limit(_limit).offset(_limit * (_page - 1))
    } else if (_end) {
      _start = parseInt(_start, 10) || 0
      _end = parseInt(_end, 10)
      if (!hasOrder) query.order(idField)
      query.limit(_end - _start).offset(_start)
    } else if (_limit) {
      _start = parseInt(_start, 10) || 0
      _limit = parseInt(_limit, 10)
      if (!hasOrder) query.order(idField)
      query.limit(_limit).offset(_start)
    }

    // // embed and expand
    // chain = chain.cloneDeep().forEach(function(element) {
    //   embed(element, _embed)
    //   expand(element, _expand)
    // })

    queryResponseAndNext(query, req, res, next)
  }

  // GET /name/:id
  // // GET /name/:id?_embed=&_expand
  function show(req, res, next) {
    let query = squel.select().from(name)
    query.where(`${idField} = ?`, req.params.id)
    queryResponseAndNext(query, req, res, next, true)

    // const _embed = req.query._embed
    // const _expand = req.query._expand
    // const resource = db
    //   .get(name)
    //   .getById(req.params.id)
    //   .value()

    // if (resource) {
    //   // Clone resource to avoid making changes to the underlying object
    //   const clone = _.cloneDeep(resource)

    //   // Embed other resources based on resource id
    //   // /posts/1?_embed=comments
    //   embed(clone, _embed)

    //   // Expand inner resources based on id
    //   // /posts/1?_expand=user
    //   expand(clone, _expand)

    //   res.locals.data = clone
    // }

    // next()
  }

  // POST /name
  function create(req, res, next) {
    // Automatically delete query parameters that can't be found
    // in the database
    Object.keys(req.body).forEach(path => {
      if (columns.length === 0) return

      const isColumn =
        _.filter(columns, column => column.toLowerCase() === path).length > 0
      if (!isColumn) {
        console.log('DELETE ' + path)
        delete req.body[path]
      }
    })

    if (_.isEmpty(req.body)) {
      res.status(400).send('No input')
      return
    }

    let query = squel.insert().into(name)
    query.setFields(req.body)
    queryRequest(query)
      .then(result => {
        let query = squel.select().from(name)
        query.where(`${idField} = ?`, req.body[idField])
        queryResponseAndNext(query, req, res, next, true)
      })
      .catch(err => {
        console.log(err)
        res.status(400).send(err.originalError.info.message)
      })
  }

  // PUT /name/:id
  // PATCH /name/:id
  function update(req, res, next) {
    const id = req.params.id

    // Automatically delete query parameters that can't be found
    // in the database
    Object.keys(req.body).forEach(path => {
      if (columns.length === 0) return

      const isColumn =
        _.filter(columns, column => column.toLowerCase() === path).length > 0
      if (!isColumn) {
        console.log('DELETE ' + path)
        delete req.body[path]
      }
    })

    if (_.isEmpty(req.body)) {
      res.status(400).send('No input')
      return
    }

    let query = squel.update().table(name)
    query.setFields(req.body)
    query.where(`${idField} = ?`, id)
    queryRequest(query)
      .then(result => {
        let query = squel.select().from(name)
        query.where(`${idField} = ?`, id)
        queryResponseAndNext(query, req, res, next, true)
      })
      .catch(err => {
        console.log(err)
        res.status(400).send(err.originalError.info.message)
      })
  }

  // DELETE /name/:id
  function destroy(req, res, next) {
    const id = req.params.id

    let query = squel.delete().from(name)
    query.where(`${idField} = ?`, id)
    queryRequest(query)
      .then(result => {
        res.locals.data = { rowsAffected: result.rowsAffected }
        next()
      })
      .catch(err => {
        console.log(err)
        res.status(400).send(err.originalError.info.message)
      })
  }

  router
    .route('/')
    .get(list)
    .post(create)

  router
    .route('/:id')
    .get(show)
    .put(update)
    .patch(update)
    .delete(destroy)

  return router
}
