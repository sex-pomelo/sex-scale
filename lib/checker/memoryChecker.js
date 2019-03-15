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


/* 检测函数 */
pro.check = function( serInfo)
{
    //console.log('--- serInfo:',serInfo);
    return new Promise(function (resolve,reject) {
        let child = exec("ps aux|grep " + serInfo.pid + "|grep -v grep|awk '{print $4}'",
            function(error, stdout, stderr)	{
                if(!!error){
                    reject();
                }else{
                    resolve(stdout.slice(0, -1));
                }
            });
    });

};


pro.scale = function( results,cb ){
    
	let total = 0;
	for(let i=0; i<results.length; i++)	{
		total += Number(results[i]);
	}

	let average = Math.round(total/results.length);
    console.log('--- memoryChecker:', results, total, average,this.condition.limit );

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





