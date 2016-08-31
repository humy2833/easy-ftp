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

var ftp1 = new EasyFTP();
var ftp2 = new EasyFTP();
ftp1.on("open", function(client){
	console.log("connect1", ftp1.isFTP);
});
ftp1.on("error", function(err){
	console.log("error1", err);
    end();
});
ftp1.on("close", function(){
	console.log("close1");
});
ftp1.connect(config2);
ftp1.ls("/storage", function(err, path){
	console.log(err, "ftp1", path.length);
	end();
});

ftp2.on("open", function(client){
	console.log("connect2", ftp2.isFTP);
});
ftp2.on("error", function(err){
	console.log("error2", err);
    end();
});
ftp2.on("close", function(){
	console.log("close2");
});
ftp2.connect(config1);
ftp2.ls("/storage", function(err, path){
	console.log(err, "ftp2", path.length);
	end();
});

var count = 0;
function end(){
    count++;
    if(count == 2)
    {
        console.log(ftp1 == ftp2);
        try{ftp1.close();}catch(e){}
        try{ftp2.close();}catch(e){}
    }
}