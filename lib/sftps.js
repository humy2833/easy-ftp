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
  this.connect(config, num);
}
util.inherits(FTPS, EventEmitter);
FTPS.prototype.connect = function(config, num){
  let self = this;
  let errCount = 0;
  let lastClient = null;
  let connected = false;
	config.type = 'sftp';
  loop(function(){
    return self.ftp.length < num;
  }, function(next, i){
    let ftp = new EasyFtp();

    function open(client, ftp){
      if(client) lastClient = client;
      if(ftp) self.ftp.push(ftp);
      if(self.ftp.length >= num)
      {
        connected = true;
        self.closeCount = num;
        self.emit("open", lastClient);
        self.emit("ready", lastClient);
      }
      next();
    }

    ftp.on("open", function(client){
      open(client, ftp);
    });
    ftp.on("error", function(err){
      if(!ftp.isConnect)
      {
        errCount++;
        if(errCount >= 10)
        {
          errCount = 0;
          num--;
          if(self.ftp.length == num) open();
          else setTimeout(next, 500);
        }
        else setTimeout(next, 500);
      }
      else self.emit("error", err);
    });
    ftp.on("download", function(path){
				self.emit("download", path);
    });
    ftp.on("downloading", function(data){
				self.emit("downloading", data);
    });
    ftp.on("upload", function(path){
				self.emit("upload", path);
    });
    ftp.on("uploading", function(data){
				self.emit("uploading", data);
    });
    ftp.on("close", function(){
      if(connected)
      {
        self.closeCount--;
        if(self.closeCount <= 0)
        {
          self.emit("close");      
        }
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
        self.ftp[self.getIdx()].ls(path, function(err, list){
          let localArr = [];
          let remoteArr = [];
          loop(list, self.ftp.length, function(i, value, next){
            if([".", ".."].indexOf(value.name) > -1) next();
            let p = pathUtil.join(path, value.name);
            if(value.type == 'd')
            {
              let ftp = self.ftp.shift();
              ftp.lsAll(p, function(e, files){
                self.ftp.push(ftp);
                if(files.length === 0)
                {
                  remoteArr.push(p);
                  localArr.push(pathUtil.join(localPath, p.substring(pathLen)));
                }
                for(let pp of files)
                {
                  remoteArr.push(pp);
                  localArr.push(pathUtil.join(localPath, pp.substring(pathLen)));
                }
                next(e);
              });
            }
            else
            {
              remoteArr.push(p);
              localArr.push(pathUtil.join(localPath, p.substring(pathLen)));
              next();
            }
          }, function(err, results){
            ok({remote : remoteArr.sort(), local : localArr.sort()});
          });
        });
      });
    }
    else return {remote : [path], local : [localPath]};
  }).then(data => {
    let servers = [];
    let len = self.ftp.length;
    for(let i=0; i<len; i++) servers.push(i);
    let except = [];
    loop(data.remote, len, function(i, value, next){
      let idx = servers.shift();
      self.ftp[idx].download(data.remote[i], data.local[i], function(err){
        servers.push(idx);
        if(err) except = except.concat(err);
        next();
      });
    }, function(err, results){
      if(cb) cb(except.length ? except : undefined);
    });
  });
}
FTPS.prototype.upload = function(localPath, remotePath, cb){	
  let self = this;
  let isDir = false;
  let p = null;
  let pathLen = 0;
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
      self.ftp[idx].upload(data.local[i], data.remote[i], function(err){
        servers.push(idx);
        next(err);
      });
    }, function(err, results){
      if(cb) cb(err);
    });
  });
}
FTPS.prototype.close = function(){
  for(let ftp of this.ftp)
  {
    try{ftp.close();}catch(e){}
  }
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