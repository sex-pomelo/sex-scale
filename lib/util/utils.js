"use strict";


const os = require('os');

let utils = module.exports;

utils.invokeCallback = function(cb) {
  if ( !! cb && typeof cb === 'function') {
    cb.apply(null, Array.prototype.slice.call(arguments, 1));
  }
};

utils.isLocal = function(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host);
};

let inLocal = function(host) {
  for (let index in localIps) {
    if (host === localIps[index]) {
      return true;
    }
  }
  return false;
};

let localIps = function() {
  let ifaces = os.networkInterfaces();
  let ips = [];
  let func = function(details) {
    if (details.family === 'IPv4') {
      ips.push(details.address);
    }
  };
  for (let dev in ifaces) {
    ifaces[dev].forEach(func);
  }
  return ips;
}();