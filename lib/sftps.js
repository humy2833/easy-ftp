'use strict';
var util = require('util');
var loop = require('easy-loop');
var EventEmitter = require('events');
var fileUtil = require('./FileUtil');
var pathUtil = require('./PathUtil');
var EasyFtp = require('./Easy-ftp');

function FTPS(config, num){
  if(!num || typeof num !== 'number' || num < 0) num = 1;
  EventEmitter.call(this);
  this.ftp = [];
  this.idx = 0;
  this.closeCount = 0;
	this.checker;
  this.connect(config, num);
}
util.inherits(FTPS, EventEmitter);
FTPS.prototype.connect = function(config, num){
  let self = this;
  let errCount = 0;
	config.type = 'sftp';
  loop(function(){
    return self.ftp.length < num;
  }, function(next, i){
    let ftp = new EasyFtp();
    ftp.on("open", function(client){
      self.ftp.push(ftp);
      if(self.ftp.length >= num)
      {
        self.closeCount = num;
        self.emit("open", client);
        self.emit("ready", client);
      }
      next();
    });
    ftp.on("error", function(err){
      if(!ftp.isConnect)
      {
        errCount++;
        if(errCount >= 3)
        {
          errCount = 0;
          num--;
        }
        next();
      }
      self.emit("error", err);
    });
    ftp.on("download", function(path){
			if(self.checker && !self.checker.has(path))
			{
				self.checker.add(path);
				self.emit("download", path);
			}
    });
    ftp.on("upload", function(path){
			if(self.checker && !self.checker.has(path))
			{
				self.checker.add(path);
				self.emit("upload", path);
			}
    });
    ftp.on("close", function(){
      self.closeCount--;
      if(self.closeCount <= 0)
      {
        ftp.isConnect = false;
        self.emit("close");      
      }
    });
		ftp.connect(config);
  });
}
FTPS.prototype.cd = function(path, cb){
  let self = this;
  let result = null;
  let task = this._makeTask(function(next, i){
    self.ftp[i].cd(path, function(err, p){
      if(!result && p) result = p;
      next(err, p);
    });
  });
  loop.parallel(task, function(err, results){
    if(cb) cb(err, result);
  });
}
FTPS.prototype.rm = function(path, cb){
  this.ftp[this.getIdx()].rm(path, function(err){
    if(cb) cb(err);
  });
}
FTPS.prototype.mkdir = function(path, cb){
  this.ftp[this.getIdx()].mkdir(path, function(err){
    if(cb) cb(err);
  });
};
FTPS.prototype.mv = function(oldPath, newPath, cb){
  this.ftp[this.getIdx()].mv(oldPath, newPath, function(err, p){
    if(cb) cb(err, p);
  });
}
FTPS.prototype.ls = function(path, cb){
  this.ftp[this.getIdx()].ls(path, function(err, list){
    if(cb) cb(err, list);
  });
}
FTPS.prototype.pwd = function(cb){
  this.ftp[this.getIdx()].pwd(function(err, data){
    if(cb) cb(err, data);
  });
}
FTPS.prototype.isDir = function(path, cb){
  this.ftp[this.getIdx()].isDir(path, function(bool){
    if(cb) cb(bool);
  });
}
FTPS.prototype.exist = function(path, cb){
  this.ftp[this.getIdx()].exist(path, function(result){
    if(cb) cb(result);
  });
}
FTPS.prototype.download = function(remotePath, localPath, cb){
  let self = this;
  let isDir = false;
  let p = null;
  let pathLen = 0;
	self.checker = new Set();
  localPath = pathUtil.normalize(localPath);
  if(/\/\*{1,2}$/.test(remotePath))
  {
    p = new Promise(ok => {
      isDir = true;
      remotePath = remotePath.replace(/\/\*{1,2}$/, '');
      remotePath = pathUtil.normalize(remotePath);
      ok(remotePath);
    });
  }
  else
  {
    remotePath = pathUtil.normalize(remotePath);
    p = new Promise(ok => {
      this.ftp[this.getIdx()].isDir(remotePath, function(bool){
        isDir = bool;
        if(bool) localPath = pathUtil.join(localPath, pathUtil.getFileName(remotePath));
        ok(remotePath);
      });
    });
  }
  p.then(function(path){
    if(isDir)
    {
      return new Promise(ok => {
        pathLen = path.length;
        self.ftp[self.getIdx()].lsAll(path, function(err, list){
          let arr = [];
          for(let p of list)
          {
            arr.push(pathUtil.join(localPath, p.substring(pathLen)));
          }
          ok({remote : list.sort(), local : arr.sort()});
        });
      });
    }
    else return {remote : [path], local : [localPath]};
  }).then(data => {
    let servers = [];
    let len = self.ftp.length;
    for(let i=0; i<len; i++) servers.push(i);
    loop(data.remote, len, function(i, value, next){
      let idx = servers.shift();
      let main = () => {
        self.ftp[idx].download(data.remote[i], data.local[i], function(err){
					servers.push(idx);
          if(!err || err &&  err.message == "No such file")
					{
            next(err);
					}
        });
      };
      main();
    }, function(err, results){
      if(cb) cb(err);
    });
  });
}
FTPS.prototype.upload = function(localPath, remotePath, cb){	
  let self = this;
  let isDir = false;
  let p = null;
  let pathLen = 0;
	self.checker = new Set();
  remotePath = pathUtil.normalize(remotePath);
  if(/\/\*{1,2}$/.test(localPath))
  {
    p = new Promise(ok => {
      isDir = true;
      localPath = localPath.replace(/\/\*{1,2}$/, '');
      localPath = pathUtil.normalize(localPath);
      ok(localPath);
    });
  }
  else
  {
    localPath = pathUtil.normalize(localPath);
    p = new Promise(ok => {
      fileUtil.isDir(localPath, function(err, bool){
        isDir = bool;
        if(bool) remotePath = pathUtil.join(remotePath, pathUtil.getFileName(localPath));
        ok(localPath);
      });
    });
  }
  p.then(function(path){
    if(isDir)
    {
      return new Promise(ok => {
        pathLen = path.length;
        fileUtil.lsAll(path, function(err, list){
          let arr = [];
          for(let p of list)
          {
            arr.push(pathUtil.join(remotePath, p.substring(pathLen)));
          }
          ok({local: list.sort(), remote : arr.sort()});
        });
      });
    }
    else return {local : [path], remote : [remotePath]};
  }).then(data => {
    let servers = [];
    let len = self.ftp.length;
    for(let i=0; i<len; i++) servers.push(i);
    loop(data.local, len, function(i, value, next){
      let idx = servers.shift();
      let main = () => {
        self.ftp[idx].upload(data.local[i], data.remote[i], function(err){
					servers.push(idx);
					if(!err || err &&  err.message == "No such file")
					{
            next(err);
					}
        });
      };
      main();
    }, function(err, results){
      if(cb) cb(err);
    });
  });
}
FTPS.prototype.close = function(){
  let self = this;
  loop(function(){return self.ftp.length > 0}, function(next){
    let ftp = self.ftp.shift();
    ftp.close();
    next();
  });
}
FTPS.prototype.getIdx = function(){
  let idx = this.idx++;
  if(this.idx === this.ftp.length) this.idx = 0;
  return idx;
}
FTPS.prototype._makeTask = function(func){
  let task = [];
  for(let i=0; i<self.ftp.length; i++)
  {
    task.push(function(next){
      func(next, i);
    });
  }
  return task;
}
module.exports = FTPS;