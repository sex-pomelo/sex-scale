'use strict';


let starter = require('../util/starter');
let logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo-scale-plugin', __filename);

let DEFAULT_INCREASE = 1;
let DEFAULT_INTERVAL = 5 * 60 * 1000;

let Operator = function (manager, app, condition, type) {
	this.app = app;
	this.type = type;
	this.manager = manager;
	this.condition = condition;
	this.depSerType = condition.depSerType || '';
	this.run = condition.run;
	this.interval = condition.interval || DEFAULT_INTERVAL;
	this.increasement = condition.increasement || DEFAULT_INCREASE;
};

module.exports = Operator;

let pro = Operator.prototype;
pro.timerID = null;

pro.start = function() {
	let self = this;

	if( this.timerID === null ){
		this.timerID = setInterval(function() {
			self.schedule();
		}, this.interval);
		logger.info("[d] start sahedule:",this.type);
    }
};

pro.stop = function(){
	if( this.timerID !== null ){
		clearInterval( this.timerID );
		logger.info("[d] stop sahedule:",this.type);
	}

	this.timerID = null;
};

pro.destory = function(){
	this.run = null;
};


pro.isRunning = function(){
	return !(this.timerID === null);
};


pro.schedule = function() {
	let self = this;
	let type = this.type;
	let servers = this.app.getServersByType(type);
	if(!!servers && !!servers.length) {
        (async function () {
            try {
                let results = [];

                const retDatas = servers.map(async (server) => {
                    let ret = await self.run.check(server);
                    results.push( ret );
                });

                for (const data of retDatas) {
                    await data;
                }

                self.run.scale(results, function(err,bScale){
                    if( err ){
                        logger.warn('-- scale:',type, err);
                    }

                    if( bScale === true ){
                        self.manager.getAvailableServers(type, self.increasement,self.depSerType, function(servers){
                            if(!!servers){
                                for(let j=0; j<servers.length; j++)	{
                                    //console.log('-- scale: ',servers[j]);
                                    if( servers[j].serverType === undefined ){
                                        servers[j].serverType = type;
                                    }

                                    starter.run(self.app, servers[j]);
                                }
                            }
                        });
                    }
                });

            }catch (err){
                logger.error('check server with error, err: %j', err.stack);
            }
        })();

	}
};

