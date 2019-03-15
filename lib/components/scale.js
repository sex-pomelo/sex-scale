'use strict';

const utils = require('../util/utils');

module.exports = function(app, opts) {
  return new Component(app, opts);
};

let Component = function(app, opts) {
	this.opts = opts || {};
	app.set('conditions', opts);
	//console.log( "--- scale opts:",opts  );
};

let pro = Component.prototype;

pro.name = '__scale__';