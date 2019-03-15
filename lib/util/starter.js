"use strict";

const util = require('util');
const utils = require('./utils');
const spawn = require('child_process').spawn;


let starter = module.exports;
let g_env = '';
starter.run = function(app, server, cb) {
  g_env = app.get('env');
  let cmd, key;
  if (utils.isLocal(server.host)) {
    let options = [];
    if (!!server.args) {
      if(typeof server.args === 'string') {
        options.push(server.args.trim());
      } else {
        options = options.concat(server.args);
      }
    }
    cmd = app.get('main');
    options.push(cmd);
    options.push(util.format('env=%s',  g_env));
    for(key in server) {
      options.push(util.format('%s=%s', key, server[key]));
    }
    localrun(process.execPath, null, options, cb);
  } else {
    cmd = util.format('cd "%s" && "%s"', app.getBase(), process.execPath);
    let arg = server.args;
    if (arg !== undefined) {
      cmd += ' ' + arg;
    }
    cmd += util.format(' "%s" env=%s ', app.get('main'), g_env);
    for(key in server) {
      cmd += util.format(' %s=%s ', key, server[key]);
    }
    sshrun(cmd, server.host, cb);
  }
};

let sshrun = function(cmd, host, cb) {
  spawnProcess('ssh', host, [host, cmd], cb);
};


let localrun = function (cmd, host, options, callback) {
  spawnProcess(cmd, host, options, callback);
};

let spawnProcess = function(command, host, options, cb) {
  let child = null;

  if(g_env === 'development') {
    child = spawn(command, options);
    let prefix = command === 'ssh' ? '[' + host + '] ' : '';

    child.stderr.on('data', function (chunk) {
      let msg = chunk.toString();
      process.stderr.write(msg);
      if(!!cb) {
        cb(msg);
      }
    });

    child.stdout.on('data', function (chunk) {
      let msg = prefix + chunk.toString();
      process.stdout.write(msg);
    });
  } else {
    child = spawn(command, options, {detached: true, stdio: 'inherit'});
    child.unref();
  }

  child.on('exit', function (code) {
    if(code !== 0) {
      logger.warn('child process exit with error, error code: %s, executed command: %s', code,  command);
    }
    if (typeof cb === 'function') {
      cb(code === 0 ? null : code);
    }
  });
};