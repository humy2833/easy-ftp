'use strict';
var fs = require('fs');
var fse = require('fs-extra');
var Path = require('path');
var pathUtil = require('./PathUtil');
var loop = require('easy-loop');

function FileUtil(){}
FileUtil.replaceCorrectPath = function(path){
	return Path.normalize(path).replace(/\\/g, '/');
}
FileUtil.getFileName = function(path){
	return Path.basename(path);
}
FileUtil.getParentPath = function(path){
	return Path.dirname(path);
}
/**
 * 파일, 디렉토리가 존재하는가?
 * @param path
 */
FileUtil.exist = function(path, cb){
	fs.stat(path, function(err, stats){
		cb(err ? false : true);
	});
}
FileUtil.existSync = function(path){
	try{
		fs.statSync(path);
		return true;
	}catch(e){return false;}
}
/**
 * 디렉토리인가?
 * @param path
 */
FileUtil.isDir = function(path, cb){
	fs.stat(path, function(err, stats){		
		cb(err, err ? false : stats.isDirectory());
	});
}
FileUtil.isDirSync = function(path){
	try{
		var stats = fs.statSync(path);
		return stats && stats.isDirectory();
	}catch(e){return false;}
}
/**
 * 디렉토리 생성(기본 : -r)
 * @param path
 * @param cb
 */
FileUtil.mkdir = function(path, cb){	
	fse.mkdirs(path, function(err) {
		if(cb)cb(err);
	});
}
FileUtil.mkdirSync = function(path){
	fse.mkdirsSync(path);
}
function makeStat(path, stats){
	return {
		name : pathUtil.getFileName(path)
		,type : stats.isDirectory() ? "d" : "f"
		,size : stats.size
		,date : stats.mtime
		,path : path
	};
}
FileUtil.stat = function(path, cb){
	var o;
	fs.stat(path, function(err, stats){
		if(err) cb(o);
		else
		{
			cb(makeStat(path, stats));
		}
	});
}
/**
 * 하위 파일, 폴더 리스트 반환
 * @param path
 * @param cb
 */
FileUtil.ls = function(path, cb){
	var self = this;
	var list = [];
	var stats = [];
	fs.readdir(path, function(err, files){
		if(err)	cb(err, list);
		else 
		{	
			loop(files, 100, function(i, value, next){
				self.stat(pathUtil.join(path, value), function(stat){
					if(stat) 
					{
						stats.push(stat);
						list.push(stat.name);
					}
					next();
				});
			}, function(err){
				if(cb) cb(err, list, stats);
			});
		}
	});
}
FileUtil.lsSync = function(path){
	return fs.readdirSync(path);
}
FileUtil.lsAll = function(path, cb){
	var self = this;
	var arr = [];
	self.ls(path, function(err, list, stats){
		if(err)	cb(err, list);
		else
		{
			loop(stats, function(i, value, next){
				let newPath = pathUtil.join(path, value.name);
				if(value.type === 'd')
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


module.exports = FileUtil;