pomelo-scale-plugin
===================
遵循 [pomelo plugin](https://github.com/NetEase/pomelo/wiki/plugin%E6%96%87%E6%A1%A3)

sex-scale-plugin for scale up servers. 插件使用redis存取相关配置/数据。



## Usage（用法）

```javascript
// app.js
let scale = require('@sex-pomelo/sex-scale-plugin');

app.configure('production|development', 'server', function() {
	app.use(scale, 
  {
    scale: {
      checkerPath:__dirname+'/checker/',
      prefix: 'scfg:vs:',
      redisNodes:{
          nodes:[{"host":127.0.0.1,"port":6379}],
          name:"mymaster",
      },
      password:''
      redisOpts: {
        username: 'test',
        password: 'pass'
      }
    }
  });
});

```
 * checkerPath, 检测脚本存放位置。
 * prefix, redis键前缀
 * redisNodes, redis 连接配置
   * nodes, redis 节点配置，如果数组长度 >1,使用哨兵模式
   * name, 哨兵名称，哨兵模式有效
 * password, redis密码

### redis配置
配置数据存储在 键 <redis prefix>monitor:backupSer,hash 类型。 如果 prefix 设置为 __scale:__,
redis键为
```scale:monitor:backupSer```
包含下面几个字段：
 * scale, scale服务类型配置（ json格式 ）
 * scaleUpTime, scale服务类型配置更新时间戳，插件根据这个判断是否配置更改；
 * servers, 备份服务器列表(json 格式)
 * updateTime, 备份服务器列表更新时间戳

#### scale格式
```javascript
{
  "servers":  {
    "connector":  {
      "limit0":  200,         // 启动新服务器门限，连接玩家数量，超过此数量，从备份列表里启动一个同类型服务器
      "maxCount0":  300,      // 最大连接数量，用于UI显示
      "interval":  5000,      // 检测间隔
      "increasement":  1,     // 每次增加服务器数量
      "checker": "connectChecker.js"  // checker 脚本位置
    }
  }
}
```

 我们的connector 会定时把在线人数记录在 redis里面，connectChecker.js 在 check函数里定时获取在线人数值，当所有connector的平均在线人数超过 
 limit0后就从备用服务器里启动一个 connector


#### servers

``` javascript
{
	"connector":[
	  {"id":"connector-server-1", "host":"127.0.0.1", "port":4050, "clientPort": 3050, "frontend": true},
	  {"id":"connector-server-2", "host":"127.0.0.1", "port":4051, "clientPort": 3051, "frontend": true},
	  {"id":"connector-server-3", "host":"127.0.0.1", "port":4052, "clientPort": 3052, "frontend": true}
	],
	"chat":[
	  {"id":"chat-server-1", "host":"127.0.0.1", "port":6050}
	],
	"gate":[
	  {"id": "gate-server-1", "host": "127.0.0.1", "clientPort": 3014, "frontend": true}
	]
}

```


## checker.js
请参照 cpuChecker.js
* 可以通过 manager.rdm 获取到插件的redis实例，执行redis相关命令。 例如, this.manager.hget() .

``` javascript
'use strict';

let Checker = function( manager,app,condition,type )
{
    this.app = app;
    this.manager = manager;
    this.condition = condition;
    this.type = type;

    //console.log('-- Chceker:', this.condition);
};


module.exports = Checker;
let pro = Checker.prototype;


/** 数据获取,获取各个服务器的用于判断的数值（例如 connector 的在线人数），每次获取数据所有服务器会执行一次此函数
*@param serInfo 服务器信息
*@return 判断值，返回 Promise 对象
*/
pro.check = function( serInfo)
{
    return new Promise(function (resolve,reject) {
        let child = exec("ps aux|grep " + serInfo.pid + "|grep -v grep|awk '{print $3}'",
            function(error, stdout, stderr)	{
                if(!!error)	{
                    reject();
                }else{
                    resolve(stdout.slice(0, -1));
                }
            });
    });
};

/** 是否需要启动服务器
 *@param results check 函数，返回的所有服务器的判断数据
 *@param cb callback(err, true|false )
*/
pro.scale = function( results,cb ){
    
	let total = 0;
	for(let i=0; i<results.length; i++)	{
		total += Number(results[i]);
	}

	let average = Math.round(total/results.length);
	if(average > this.condition.limit) {
		if( cb ){
            cb( null, true );
        }
	}else{
        if( cb ){
            cb( null, false );
        }
    }
};

/** 初始化checker */
pro.init = function() {
    /** some init */
};
 
/** 在所有checker 启动完后调用 */
pro.afterStart = function(){
    let manager = this.manager;

};


```


