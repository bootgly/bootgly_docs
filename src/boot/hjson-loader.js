/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Zsolt R. Molnar zsolt@zsoltmolnar.hu, founder of GarlicTech Ltd. (http://www.garlictech.com)
*/
const HJSON = require('hjson')
const loaderUtils = require('loader-utils')

module.exports = function (source) {
  this.cacheable && this.cacheable()

  const value = typeof source === 'string' ? HJSON.parse(source) : source

  this.value = [value]

  const query = this.query ? loaderUtils.parseQuery(this.query) : {}

  const stringified = JSON.stringify(value, undefined, '\t')

  return query.str ? stringified : 'module.exports = ' + stringified + ';'
}
