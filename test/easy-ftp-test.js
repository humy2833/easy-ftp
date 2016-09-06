var config1 = {
	host: "localhost",
    port: 21,
    type : "ftp",
    username: '',
    password: '',
    path: "/"
};

var EasyFTP = require('../lib/easy-ftp.js');

var ftp1 = new EasyFTP();
//var ftp2 = new EasyFTP();
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
ftp1.connect(config1);
ftp1.ls(config1.path, function(err, path){
	console.log(err, path ? path.length : "");
	end();
});

function end(){
    try{ftp1.close();console.log("close");}catch(e){}
}