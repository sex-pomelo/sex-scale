'use strict';

const ScaleManager = require('../manager/scaleManager');

let Event = function(app) {
	this.app = app;
};

module.exports = Event;

Event.prototype.start_all = function() {
 	let conditions = this.app.get('conditions');
 	let scaleManager = new ScaleManager(this.app, conditions,function( err, sta ){
		 if( err === null ){
			 scaleManager.start();
		 }
	});
};