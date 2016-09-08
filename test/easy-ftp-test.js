var config1 = {
	host: "localhost",
    port: 21,
    type : "ftp",
    username: '',
    password: '',
    path: "/"
};

var loop = require('easy-loop');
var EasyFTP = require('../lib/easy-ftp.js');

var ftp1 = new EasyFTP();
//var ftp2 = new EasyFTP();
ftp1.on("open", function(client){
	console.log("event open");
    end();
});
ftp1.on("upload", function(){
	console.log("event upload", arguments);
});
ftp1.on("download", function(){
	console.log("event download", arguments);
});
ftp1.on("error", function(err){
	console.log("event error1", err);
    end();
});
ftp1.on("close", function(){
	console.log("event close1");
});
ftp1.connect(config1);


function end(){
    try{ftp1.close();}catch(e){}
}