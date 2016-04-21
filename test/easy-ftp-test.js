var config1 = {
	host: 'localhost',
    port: 21,
    type : "ftp",
    username: 'id',
    password: 'password'
};
var config2 = {
    host: 'localhost',
    port: 22,
    type : "sftp",
    username: 'id',
    password: 'password'
};

var EasyFTP = require('../lib/easy-ftp.js');

var ftp = new EasyFTP();
ftp.on("open", function(client){
	console.log("connect", ftp.isFTP);
});
ftp.on("error", function(err){
	console.log("error", err);
});
ftp.on("close", function(){
	console.log("close");
});
ftp.on("upload", function(path){
	console.log("upload", path);
});
ftp.on("download", function(path){
	console.log("download", path);
});

ftp.connect(config2);


ftp.pwd(function(err, path){
	console.log(err, path);
	ftp.close();
});