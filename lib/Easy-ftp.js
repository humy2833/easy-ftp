'use strict';
var defaultConfig = {
	host: 'localhost',
	port: 21,
	type: 'ftp',
	username: 'anonymous',
	password: 'anonymous@'
};

const util = require('util');
var EventEmitter = require('events');
var pathUtil = require('./PathUtil');
var fs = require('fs');
var FTPClient = require('ftp-simple');
var SSHClient = require('ssh2').Client;
var FileUtil = require('./FileUtil');
var loop = require('easy-loop');

function EasyFTP(config){
	if(!this instanceof EasyFTP) throw "must 'new EasyFTP()'";
	EventEmitter.call(this);
	if(config)
	{
		this.connect(config);
	}
}
util.inherits(EasyFTP, EventEmitter);

/**
 * 설정 초기화
 */
EasyFTP.prototype.init = function(config){
	this.isWindow = false;
	this.isLoginFail = false;
	this.waitCount = 0;
	if(config.user) config.username = config.user;
	if(config.pass) config.password = config.pass;
	this.config = Object.assign(defaultConfig, config);
	if(!this.config.type) this.config.type = 'ftp';
	if(Number.isInteger(config.keepaliveInterval)) config.keepalive = config.keepaliveInterval;
	if(!Number.isInteger(config.keepalive)) config.keepalive = 1000 * 10;
	if(!Number.isInteger(config.connTimeout)) config.connTimeout =  1000 * 20;
	if(!Number.isInteger(config.readyTimeout)) config.readyTimeout = config.connTimeout;
	config.keepaliveInterval = config.keepalive;
	if(this.config.type === 'sftp' && FileUtil.existSync(this.config.privateKey))
	{
		this.config.privateKey = fs.readFileSync(this.config.privateKey);
	}
};
/**
 * 접속
 */
EasyFTP.prototype.connect = function(config){
	var self = this;
	if(!config) throw "must config param";
	this.init(config);
	if(this.config.type === 'sftp')
	{
		this.isFTP = false;
		this.client = new SSHClient();
	}
	else
	{	
		this.isFTP = true;
		this.client = FTPClient.create(config);
	}
	this.client.on('ready', function(){
		self.isConnect = true;
		var ready = function(err, path){
			self.currentPath = err ? "/" : path;
			self.emit("open", self.client);
		};
		if(self.config.path && (self.config.path = self.getRealRemotePath(self.config.path)))
		{
			self.cd(self.config.path, function(err, p){
				self.pwd(ready, true);
			});
		}
		else
		{
			self.pwd(ready, true);
		}
	});
	this.client.on('close', function(){
		self.isConnect = false;
		self.emit("close");
	});
	this.client.on('error', function(err){
		this.isLoginFail = true;
		self.emit("error", err);
	});	
	if(!this.isFTP) this.client.connect(this.config);
};
/**
 * 접속 종료
 */
EasyFTP.prototype.close = function(){
	try{
		this.client.end();
	}catch(e){
	}finally{this.client = null;}
};
/**
 * 접속 대기
 */
EasyFTP.prototype.waitConnect = function(cb){
	var self = this;
	if(this.isLoginFail || this.waitCount >= 50)
	{
		this.close();
		return;
	}
	if(!this.isConnect)
	{
		this.waitCount++;
		setTimeout(function(){
			self.waitConnect(cb);
		}, 500);
	}
	else
	{
		this.waitCount = 0;
		cb();
	}
};
/**
 * Full 원격 경로 구하기
 */
EasyFTP.prototype.getRealRemotePath = function(path){
	var p = path;
	if(path.indexOf("/") !== 0)
	{
		var tempCurrentPath = this.currentPath;
		if(path.indexOf("./") === 0 && path.length > 2)
		{
			path = path.substring(2);
		}
		var upIdx = path.indexOf("../");		
		while(upIdx === 0 && tempCurrentPath != "/")
		{
			tempCurrentPath = tempCurrentPath.substring(0, tempCurrentPath.lastIndexOf("/"));
			path = path.substring(3);
			upIdx = path.indexOf("../");
		}
		if(tempCurrentPath === '/') 	p = tempCurrentPath + path;
		else 	p = tempCurrentPath + "/" + path;		
	}
	if(p.length > 1 && /\/$/.test(p)) p = p.substring(0, p.length-1);
	return p;
};
/**
 * 업로드
 */
EasyFTP.prototype.upload = function(localPath, remotePath, cb, isRecursive){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.upload(localPath, remotePath, cb, isRecursive);
		});
	}
	else
	{
		var cwd = this.currentPath;
		if(localPath instanceof Array)
		{
			if(typeof remotePath === 'function')
			{
				cb = remotePath;
				remotePath = null;
			}
			loop(localPath, function(i, value, next){
				var local = value;
				var remote = remotePath;
				if(typeof value === 'object')
				{
					local = value.local;
					remote = value.remote;
				}
				self.upload(local, remote, function(err){
					next(err);
				});
			}, function(err){
				self.cd(cwd, function(){
					if(cb)cb(err);
				});
			});
			return;
		}
		localPath = FileUtil.replaceCorrectPath(localPath);
		if(/\/\*{1,2}$/.test(localPath))
		{
			isRecursive = true;
			localPath = localPath.replace(/\/\*{1,2}$/, '');
		}
		remotePath = this.getRealRemotePath(remotePath);
		FileUtil.isDir(localPath, function(err, isDir){
			if(isDir)
			{
				if(!isRecursive)
				{
					isRecursive = FileUtil.getFileName(localPath) == FileUtil.getFileName(remotePath);
				}
				var parent = FileUtil.replaceCorrectPath(remotePath + (isRecursive ? "" : "/" + FileUtil.getFileName(localPath)));			
				self.cd(parent, function(err){
					if(err)	
					{	
						self.mkdir(parent, function(err){
							if(err)
							{
								self.cd(cwd, function(e){
									if(!e) bodyDir();
									else if(cb)cb(err);
								});
							}
							else
							{
								self.emit("upload", parent);
								bodyDir();
							}
						});
					}
					else bodyDir();
				});
				
				function bodyDir(){
					FileUtil.ls(localPath, function(err, list){
						if(err) cb(err);
						else
						{
							loop(list, function(i, value, next){
								//console.log("bodyDir start : ", localPath + "/" + value, parent + "/" + value);
								self.upload(localPath + "/" + value, parent + "/" + value, function(err){
									//console.log("bodyDir end : ", localPath + "/" + value, parent + "/" + value, err);
									next(err);
								}, true);
							}, function(err){
								self.cd(cwd, function(){
									if(cb)cb(err);
								});
							});
						}
					});
				}	
			}
			else
			{
				if(!isRecursive)
				{
					self.cd(remotePath, function(err){
						if(!err)
						{
							remotePath = FileUtil.replaceCorrectPath(remotePath + "/" + FileUtil.getFileName(localPath));
						}
						var parent = FileUtil.getParentPath(remotePath);
						self.cd(parent, function(err){
							if(err)	
							{
								self.mkdir(parent, function(err){
									if(err) 
									{
										self.cd(cwd, function(e){
											if(!e) uploadFile();
											else if(cb)cb(err);
										});
									}
									else
									{
										self.emit("upload", parent);
										uploadFile();
									}
								});
							}
							else uploadFile();
						});
					});
				}
				else uploadFile();

				function uploadFile(){
					if(self.isFTP)
					{	
						self.client.upload(localPath, remotePath, function(err){						
							if(!err) self.emit("upload", remotePath);
							self.cd(cwd, function(){
								if(cb)cb(err);
							});
						});
					}
					else
					{
						self.client.sftp(function(err, sftp){
							if(!sftp) 
							{
								if(cb)cb(err);
							}
							else
							{
								sftp.fastPut(localPath, remotePath, {step:function(transferred, chunk, total){
									self.emit("uploading", {localPath : localPath, remotePath : remotePath, transferred : transferred, chunk : chunk, total : total});
								}}, function(err){
									sftp.end();
									if(!err) self.emit("upload", remotePath);
									self.cd(cwd, function(){
										if(cb)cb(err);
									});
								});
							}
						});
						/*
						getSftp(self.client, function(err, sftp){
							console.log("getSftp end : ", err, self.client.obj === sftp);
							if(err)
							{
								self.cd(cwd, function(){
									if(cb)cb(err);
								});
							}
							else
							{
								console.log("fastPut start : ", localPath, remotePath, FileUtil.existSync(localPath));
								//self.exist(remotePath, function(result){console.log("exist : ", result);								
									sftp.fastPut(localPath, remotePath, {concurrency:1}, function(err){
										console.log("fastPut end : ", localPath, remotePath, err);
										if(!err) self.emit("upload", remotePath);
										self.cd(cwd, function(){
											if(cb)cb(err);
										});
									});
								//});
							}
						});
						*/
					}
				}
			}
		});
	}	
};
/**
 * 다운로드
 */
EasyFTP.prototype.download = function(remotePath, localPath, cb, isRecursive){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.download(remotePath, localPath, cb, isRecursive);
		});
	}
	else
	{
		var cwd = this.currentPath;
		if(remotePath instanceof Array)
		{
			if(typeof localPath === 'function')
			{
				cb = localPath;
				localPath = null;
			}
			var except = [];
			loop(remotePath, function(i, value, next){
				var local = localPath;
				var remote = value;
				if(typeof value === 'object')
				{
					local = value.local;
					remote = value.remote;
				}
				self.download(remote, local, function(err){
					if(err) except = except.concat(err);
					next();
				});
			}, function(err){
				self.cd(cwd, function(){
					if(cb)cb(except.length ? except : undefined);
				});
			});
			return;
		}
		remotePath = this.getRealRemotePath(remotePath);
		var tempLocalPath = localPath;
		localPath = FileUtil.replaceCorrectPath(localPath);
		if(/\/\*{1,2}$/.test(remotePath))
		{
			isRecursive = true;
			remotePath = remotePath.replace(/\/\*{1,2}$/, '');
		}
				
		this.cd(remotePath, function(err, path){
			if(err)
			{
				if(!isRecursive)
				{
					FileUtil.isDir(localPath, function(err, isDir){
						if(isDir)
						{
							localPath = FileUtil.replaceCorrectPath(localPath + "/" + FileUtil.getFileName(remotePath));
							bodyFile();
						}
						else
						{
							if(/\/$/.test(tempLocalPath))
							{	
								FileUtil.mkdir(tempLocalPath, function(err){
									localPath = tempLocalPath + FileUtil.getFileName(remotePath);
									bodyFile();
								});
							}
							else
							{
								FileUtil.mkdir(FileUtil.getParentPath(localPath), function(err){
									bodyFile();
								});
							}
						}
					});
				}
				else bodyFile();
			}
			else
			{
				if(!isRecursive)
				{
					isRecursive = FileUtil.getFileName(localPath) == FileUtil.getFileName(remotePath);
				}
				var parent = FileUtil.replaceCorrectPath(localPath + (isRecursive ? "" : "/" + FileUtil.getFileName(remotePath)));
				FileUtil.exist(parent, function(bool){
					if(!bool)
					{
						FileUtil.mkdir(parent, function(err){
							self.emit("download", parent);
							bodyDir(parent);
						});
					}
					else bodyDir(parent);
				});
			}
		});
		
		function bodyDir(parent){
			self.ls(remotePath, function(err, list){
				var except = [];
				loop(list, function(i, value, next){
					self.download(remotePath + "/" + value.name, parent + "/" + value.name, function(err){
						if(err) except = except.concat(err);
						next();
					}, true);
				}, function(err){
					self.cd(cwd, function(){
						if(cb)cb(except.length ? except : undefined);
					});
				});
			});
		}
		
		function bodyFile(){
			if(self.isFTP)
			{
				self.client.download(remotePath, localPath, function(err){
					if(!err) self.emit("download", localPath);
					self.cd(cwd, function(){
						if(cb)cb(err ? [{remote : remotePath, local : localPath, message : err.message}] : undefined);
					});
				});
			}
			else
			{
				self.client.sftp(function(err, sftp){						
					if(!sftp) 
					{
						if(cb)cb(err);
					}
					else
					{
						sftp.fastGet(remotePath, localPath, {step:function(transferred, chunk, total){
							self.emit("downloading", {localPath : localPath, remotePath : remotePath, transferred : transferred, chunk : chunk, total : total});
						}}, function(err){
							sftp.end();
							if(!err) self.emit("download", localPath);
							self.cd(cwd, function(){
								if(cb)cb(err ? [{remote : remotePath, local : localPath, message : err.message}] : undefined);
							});
						});
					}
				});
				/*
				getSftp(self.client, function(err, sftp){
					if(err)
					{
						self.cd(cwd, function(){
							if(cb)cb(err);
						});
					}
					else
					{
						sftp.fastGet(remotePath, localPath, {concurrency:1}, function(err){
							if(err)
							{
								self.cd(cwd, function(){
									if(cb)cb(err);
								});
							}
							else
							{
								self.emit("download", localPath);
								self.cd(cwd, function(){
									if(cb)cb();
								});
							}
						});
					}
				});
				*/
			}
		}		
	}	
};
/**
 * 현재경로 반환
 */
EasyFTP.prototype.pwd = function(cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.pwd(cb);
		});
	}
	else
	{
		if(this.isFTP)
		{	
			this.client.pwd(function(err, path){
				if(cb)cb(err, path);
			});
		}
		else
		{
			self.client.sftp(function(err, sftp){
				if(!sftp) 
				{
					if(cb)cb(err, self.currentPath);
				}
				else
				{
					sftp.realpath(self.getRealRemotePath("."), function(err, path){
						sftp.end();
						self.currentPath = path;
						if(cb)cb(err, path);
					});
				}
			});
		}
	}
};
/**
 * 폴더 이동
 */
EasyFTP.prototype.cd = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.cd(path,cb);
		});
	}
	else
	{
		path = this.getRealRemotePath(path);
		if(this.isFTP)
		{
			this.client.cd(path, function(err){
				if(err) 
				{
					if(cb)cb(err);
				}
				else
				{
					self.currentPath = path;
					if(cb)cb(err, path);
				}
			});
		}
		else
		{
			self.client.sftp(function(err, sftp){
				if(!sftp) 
				{
					if(cb)cb(err, self.currentPath);
				}
				else
				{
					sftp.opendir(path, function(err, handle){
						sftp.end();
						if(err) 
						{
							if(cb)cb(err);
						}
						else
						{
							self.currentPath = path;
							if(cb)cb(err, path);
						}
					});
				}
			});
			/*
			getSftp(this.client, function(err, sftp){
				sftp.opendir(path, function(err, handle){
					if(err) 
					{
						if(cb)cb(err);
					}
					else
					{
						self.currentPath = path;
						if(cb)cb(err, path);
					}
				});
			});
			*/
		}
	}
};
EasyFTP.prototype.lsAll = function(path, cb){
	var self = this;
	var arr = [];
	path = this.getRealRemotePath(path);
	self.ls(path, function(err, list){
		if(err)	cb(err, list);
		else
		{
			loop(list, function(i, value, next){
				let newPath = pathUtil.join(path, value.name);
				if([".", ".."].indexOf(value.name) > -1) next();
				else if(value.type === 'd')
				{
					self.lsAll(newPath, function(err, list){
						if(list.length === 0) arr.push(newPath);
						arr = arr.concat(list);
						next();
					});
				}
				else
				{
					arr.push(newPath);
					next();
				}
			}, function(err){
				if(cb) cb(err, arr);
			});
		}
	});
}
EasyFTP.prototype.isDir = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.isDir(path, cb);
		});
		return;
	}
	var p = this.getRealRemotePath(path);
	this.ls(p, function(err){
		if(cb) cb(err ? false : true);
	});	
}
/**
 * 폴더 생성
 */
EasyFTP.prototype.mkdir = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.mkdir(path, cb);
		});
	}
	else
	{
		var p = this.getRealRemotePath(path);
		if(this.isFTP)
		{
			this.client.mkdir(p, function(err){
				if(cb)cb(err);
			});
		}
		else
		{
			self.client.sftp(function(err, sftp){
				sftp.mkdir(p, function(err){
					if(sftp) sftp.end();
					if(err && String(err).toLowerCase().indexOf("no such file") > -1)
					{
						var parent = pathUtil.getParentPath(p);
						if(parent == p)
						{
							if(cb) cb(err);
						}
						else 
						{
							self.mkdir(parent, function(err){
								
							});
						}

						makeParent(p, function(err){
							if(err)
							{
								if(cb)cb(err);
							}
							else
							{
								self.mkdir(p, function(err){
									if(cb)cb(err);
								});
							}
						}); 
					}
					else if(cb) cb(err);
					
					function makeParent(p, cb){
						var parent = pathUtil.getParentPath(p);
						if(parent == p)
						{
							if(cb) cb(err);
						}
						else
						{
							self.mkdir(parent, function(err){
								if(err)
								{
									makeParent(parent);
								}
								else
								{
									self.mkdir(p, function(err){

									});
								}
							});
						}
					}
				});
			});
			/*
			this.client.exec('mkdir -p "' + p + '"', function(err, stream) {
			    if(cb)cb(err);
			});
			*/
		}
	}
};
/**
 * 파일, 폴더 삭제
 */
EasyFTP.prototype.rm = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.rm(path, cb);
		});
	}
	else
	{
		var p = this.getRealRemotePath(path);
		if(this.isFTP)
		{
			this.client.rm(p, function(err){
				if(cb)cb(err);
			});
		}
		else
		{
			self.client.sftp(function(err, sftp){
				sftp.stat(p, function(err, stat){
					if(err)
					{
						if(sftp) sftp.end();
						if(cb) cb(err);
					}
					else
					{
						if(stat.isDirectory())
						{
							sftp.rmdir(p, function(err1){
								if(sftp) sftp.end();
								if(err1)
								{
									self.client.exec('rm -rf "' + p + '"', function(err2, stream) {
										if(cb) cb(err2);
									});
								}
								else if(cb) cb(err1);
							});
						}
						else
						{
							sftp.unlink(p, function(err){
								if(sftp) sftp.end();
								if(cb)cb(err);
							});
						}
					}
				});
			});
		}
	}
};
/**
 * 리스트 반환({name:파일명, size:파일크기, type:폴더='d' or 파일='f', date:날짜}
 */
EasyFTP.prototype.ls = function(path, cb, errCnt){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.ls(path, cb);
		});
	}
	else
	{
		var p = this.getRealRemotePath(path);
		if(this.isFTP)
		{
			this.client.ls(p, function(err, list){
				if(cb) cb(err, list);
			});
		}
		else
		{
			self.client.sftp(function(err, sftp){
				if(err)
				{
					if(sftp)sftp.end();
					if(errCnt === 0) cb(err);
					else self.ls(path, cb, errCnt === undefined ? 5 : --errCnt);
				}
				else
				{
					sftp.readdir(p, function(err, list){
						sftp.end();
						if(err)
						{
							if(cb) cb(err);
						}
						else
						{
							for(var i=0; i<list.length; i++)
							{	
								list[i].name = list[i].filename;
								list[i].date = new Date((list[i].attrs.mtime || list[i].attrs.atime)*1000);
								list[i].size = list[i].attrs.size;
								list[i].type = list[i].longname.indexOf("d") === 0 ? 'd':'f';
							}
							if(cb)cb(err, list);
						}
					});
				}
			});
			/*
			getSftp(this.client, function(err, sftp){
				sftp.readdir(p, function(err, list){
					if(err)
					{
						if(cb) cb(err);
					}
					else
					{
						for(var i=0; i<list.length; i++)
						{	
							list[i].name = list[i].filename;
							list[i].date = new Date((list[i].attrs.mtime || list[i].attrs.atime)*1000);
							list[i].size = list[i].attrs.size;
							list[i].type = list[i].longname.indexOf("d") === 0 ? 'd':'f';
						}
						if(cb)cb(err, list);
					}
				});
			});
			*/
		}
	}
};
/**
 * 파일, 폴더 이동
 */
EasyFTP.prototype.mv = function(oldPath, newPath, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.mv(oldPath, newPath, cb);
		});
	}
	else
	{
		var op = this.getRealRemotePath(oldPath);
		var np = this.getRealRemotePath(newPath);
		if(this.isFTP)
		{
			this.client.mv(op, np, function(err, newPath){
				if(cb)cb(err, np);
			});
		}
		else
		{
			/*
			this.exist(np, function(result){
				if(result) 
				{
					if(cb) cb("already exist : " + np);					
				}
				else
				{					
					self.client.exec('mv "' + op + '" "' + np + '"', function(err, stream) {
						console.log('mv "' + op + '" "' + np + '"', err);
							if(cb)cb(err);
					});
				}
			});
			*/
			
			self.client.sftp(function(err, sftp){
				if(!sftp) 
				{
					if(cb)cb(err, np);
				}
				else
				{
					sftp.rename(op, np, function(err){
						sftp.end();
						if(cb)cb(err, np);
					});
				}
			});
			
			/*
			getSftp(this.client, function(err, sftp){
				sftp.rename(op, np, function(err){
					if(cb)cb(err, np);
				});
			});
			*/
		}
	}
};
/**
 * 파일 혹은 폴더가 존재하는가?
 */
EasyFTP.prototype.exist = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.exist(path, cb);
		});
	}
	else
	{
		var cwd = this.currentPath;
		this.cd(path, function(err){
			if(!err)
			{	
				self.cd(cwd, function(){
					if(cb)cb(true);
				});
			}
			else
			{
				var parentPath = FileUtil.getParentPath(path);
				var fileName = FileUtil.getFileName(path);
				self.ls(parentPath, function(err, list){
					self.cd(cwd, function(){
						if(err)
						{
							cb(false);
						}
						else
						{
							var exist = false;
							for(var i=0; i<list.length; i++)
							{
								if(list[i].name == fileName)
								{
									exist = true;
									break;
								}
							}
							cb(exist);
						}
					});
				});
			}
		});
	}	
};

module.exports = EasyFTP;


