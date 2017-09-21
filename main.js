'use strict';
var EasyFtp = require('./lib/Easy-ftp');
var ftp = require('ftp-simple');
var sftp = require('./lib/sftps');
module.exports = EasyFtp;

function main(config, num){
  if(!num || typeof num !== 'number' || num < 0) num = 1;

  if(num == 1) return new EasyFtp(config);
  else
  {
    if(config.type === 'sftp')  return new sftp(config, num);
    else  return new ftp.Parallel(config, num);
  }
}
module.exports.Parallel = main;