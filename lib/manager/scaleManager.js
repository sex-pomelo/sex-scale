'use strict';

const Redis = require('ioredis');
const path = require('path');
const util = require('util');
const fs = require('fs');
const Operator = require('./operator');

const logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo-scale-plugin', __filename);

let ScaleManager = function(app, conditions, cb ) {
	this.app = app;
	this.tip = app.getServerId();
	this.opts = conditions;
	this.started = false;
	if( !!this.opts.prefix ){
		this.opts.prefix = 'scfg:vs:';
	}

	this.key_prefix = this.opts.prefix;
	this.key_backupSer = this.key_prefix + "monitor:backupSer";
	this.key_monitor = this.key_prefix + "monitor";

	this.backupUpdateTime = -1; 
	this.scaleUpTime = -1;
	this.scaleCfgTimerID = null;
	this.scaleUpdateTime = -1;
	this.operaS = {};

	this.scaleCfg = {
		servers:{}
	};

	//　servers select val，指定类型的服务器选择了情况
	this.serverSelValue = {};

	this.rdm = null;
	let self = this;
	if(this.opts.redisNodes.nodes.length === 1) {
		let redisCfg = this.opts.redisNodes.nodes[0];
		this.rdm = new Redis(redisCfg.port, redisCfg.host, this.redisOpts);
	  } else {
		this.rdm = new Redis({
		  sentinels: this.opts.redisNodes.nodes,
		  password: this.opts.password,
		  name: this.opts.redisNodes.name,
		}, this.redisOpts);
	  }
	
	  this.rdm.on('connect', function() {
		logger.info(`---- ${self.tip} connected to redis successfully !`);
		if(self.opts.password) {
		  self.rdm.auth(self.opts.password);
		}
	
		// clear command
		if(!self.started) {
		  self.started = true;
		  self.init(cb);
		}
	  });
	
	  this.rdm.on('error', function(error) {
		logger.error(`${self.tip} has errors with redis server, with error: ${error}`);
	  });
	
	  this.rdm.on('close', function() {
		logger.warn(`${self.tip} has been closed with redis server.`);
	  });
	
	  this.rdm.on('end', function() {
		logger.warn(`${self.tip} is over and without reconnection.`);
	  });
};

module.exports = ScaleManager;

let pro = ScaleManager.prototype;


pro.init = function( cb ) {
	this.availableServers = {}; // 可运行备份服务器列表 
	this.orgiBackupServers = {}; // 原始备份服务器列表 

	this.loadBackupServers();

	let self = this;
	setInterval( function(){ self.loadBackupServers(); },10000 );

	this.loadScaleConfig( function(err,val){
		if(cb) { cb(err,val); };
	});
};



pro.loadScaleConfig = function( cb ){
	let self = this;
    this.rdm.hmget( self.key_backupSer, ['scaleUpTime','scale'],function(err, reply){
        if( err ){
			logger.warn('loadScaleConfig Error：', err.toString());
            if( cb){ cb( err, 0);};
        }else{
			let repTmp = reply[1];
			if( reply[1] === null ){
				repTmp = '{"servers":{}}';
			}
			self.scaleCfg = JSON.parse(repTmp);

			if( reply[0] !== null ){
				self.scaleUpdateTime = Number(reply[0]);
			}

			if( cb ) { cb(null,0); }
        }
    });

};

/** 读取备份服务器列表 */
pro.loadBackupServers = function(cb){
	let self = this;
    this.rdm.hmget( self.key_backupSer, ['updateTime','servers'],function(err, reply){
        if( err ){
            if(cb) { cb( err, 0); };
        }else{
			let upTime = Number(reply[0]);
			if( self.backupUpdateTime !== upTime)
			{
				self.backupUpdateTime = upTime;
				
				//
				let tReplay = reply[1];
				if( reply[1] === null ){
					reply[1] = '{}';
				}

				// 1. 停止所有监控
				for( let opera in self.operaS ){
					self.operaS[opera].stop();
				}

				// 2. 更新备份服务器列表
				let tmpServers = JSON.parse( reply[1] );
				//let addServers = Array();
				for( let serType in tmpServers ){
					let sers = tmpServers[serType];
					let len = sers.length;

					let runSers = self.app.getServersByType( serType );
					for( let i=0;i<len;i++ ){
						let serInfo = sers[i];
						
						if( self.orgiBackupServers[serType] === undefined ){
							self.orgiBackupServers[serType] = {};
						}
					
						if( self.orgiBackupServers[serType][serInfo.id] === undefined ){
							//addServers.push( util._extend({},serInfo) );
							self.orgiBackupServers[serType][serInfo.id] = util._extend({},serInfo);

							if( self.availableServers[serType] === undefined ){
								self.availableServers[serType] = [];
							}

							let bPush = true;
							if( !!runSers && !!runSers.length ){
								for( let j=0;j<runSers.length;j++ ){
									if( runSers[j].id === serInfo.id ){
										bPush = false;
										break;
									}
								}
							}
							if( bPush === true ){
								self.availableServers[serType].push(util._extend({},serInfo));
							}
						}
					}
				}

				/// 启动计时器
				for( let opera in self.operaS ){
					self.operaS[opera].start();
				}
			}
        }
    });
};

pro.start = function() {
	let self = this;
	this.makeOperator();
	this.scaleCfgTimerID = setInterval( function(){
		self.checkScaleConfig();
	},10000 );
};


pro.checkScaleConfig = function(){
	let self = this;
	this.rdm.hget( self.key_backupSer, 'scaleUpTime',function(err, reply){
        if( err ){
            if(cb) { cb( err, 0); };
        }else{
			if( reply === null ){
				return;
			}
			//console.log('--- scaleUpTime:',reply,self.scaleUpdateTime);
			let upTime = Number(reply);
			if( self.scaleUpdateTime !== upTime)
			{
				self.scaleUpdateTime = upTime;
				
				// 1. 停止所有监控
				for( let opera in self.operaS ){
					self.operaS[opera].stop();
				}

				self.loadScaleConfig( function( err, val){
					//console.log('------- loadScaleConfig',err,val);
					if( err === null){
						//console.log('----- makeOperator');
						self.makeOperator(true);
					}

					/// 启动计时器
					for( let opera in self.operaS ){
						self.operaS[opera].start();
					}
				});
			}
        }
    });

};


pro.makeOperator = function( isReload){
	let self = this;
	for( let opera in self.operaS ){
		self.operaS[opera].destory();
		delete self.operaS[opera];
	}
	this.serverSelValue = {};

	for( let it in this.scaleCfg.servers )
	{
		let item = this.scaleCfg.servers[ it ];
		let CheckerFile = getChekerPath( item.checker,this );
		if( CheckerFile.length > 0 ){
			//console.log("-- checker:", CheckerFile);
			let Checker = require( CheckerFile );
			if( Checker ){
				item.run = new Checker( self, self.app, item,it );
				let itemOpera = new Operator( self,this.app, item, it );
				if( typeof( item.run.init ) === 'function' ){
					item.run.init( isReload);
				}
				
				itemOpera.start();
				self.operaS[it] = itemOpera;

				self.serverSelValue[ it ] = null;
			}
		}
	}

	for( let opera in self.operaS ){
		if( self.operaS[opera].run.afterStart !== undefined ){
			self.operaS[opera].run.afterStart();
		}
	}


};

/** 设置服务器选择值 */
pro.setServerSelValue = function( serType, value ){
	this.serverSelValue[serType] = value;
	//console.info("[d] -- setServerSelValue:", serType, value,this.serverSelValue);
};

pro.getAvailableServers = function(type, number,depSerType,cb) {
	let self = this;
	
	let selDepSer = 'undefined'; //! 依赖的服务器ID
	if( depSerType.length > 0 ){
		if( this.serverSelValue[ depSerType ] !== null && this.serverSelValue[ depSerType ] !== undefined ){
			selDepSer = this.serverSelValue[ depSerType ].toString();
		}else{ /// 有依赖，但是没有依赖服务器的信息
			logger.warn("[d] --- not dep Servers info [ %s : %s ] servers to scale up[0].",type,depSerType);
			
			if( cb ) { cb( null ); }
			return;
		}
	}

	let availables = this.availableServers[type];
	//console.log('--- availables:', availables);
	if( availables === undefined ){
		logger.warn("[d] --- not enough [ %s ] servers to scale up[0].",type);
		if( cb ) { cb( null ); }
		return;
	}
	let sliceIdx = [];  // 已选择的服务器在备用服务器里的索引
	let selServer = [];
	let len = availables.length;
	for( let i =0; i< len; i++ ){
		let server = util._extend({}, availables[i] );
		selServer.push( server );
		sliceIdx.push( i );
		if( sliceIdx.length >= number ){
			break;
		}
	}

	if( number > sliceIdx.length ){
		logger.warn("[d] --- not enough [ %s ] servers to scale up[1].",type,selServer);
		if( cb ) { cb( null ); }
		return;
	}

	/// remove selected servers
	sliceIdx.reverse();
	for( let i=0;i<sliceIdx.length;i++ ){
		availables.splice( sliceIdx[i], 1);
	}

	/// 动态增加服务器映射
	if( (self.operaS[type] !== undefined) && (self.operaS[type].run['beforeScale'] !== undefined))
	{
		self.operaS[type].run.beforeScale(selServer,selDepSer, cb );
	}else{
		if( cb ) { cb( selServer ); }
	}
};



function getChekerPath( checker, self ){
	let checkFullPath = self.opts.checkerPath + checker;
	let pwd = path.resolve(checkFullPath);
	if( fs.existsSync( pwd ) === true ){
		return pwd;
	}else{
		pwd = __dirname+'/../checker/' + checker
		if( fs.existsSync( pwd ) === true ){
			return pwd;
		}

		pwd = path.resolve('./node_modules/' +checker);
		if( fs.existsSync( pwd ) === true ){
			return pwd;
		}
	}

	return '';
}