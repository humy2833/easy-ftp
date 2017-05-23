var config1 = {
	"host": "localhost",
	"port": 21,
	"user": "",
	"pass": ""
};;

var loop = require('easy-loop');
var EasyFTP = require('../main');

//var ftp1 = new EasyFTP(config1); //13967.730ms , 148819.925ms
var ftp1 = EasyFTP.Parallel(config1, 3); //     56392.136ms, 49064.603ms
ftp1.on("open", function(client){
	console.log("event open");
    console.time("time");
    //ftp1.upload("C:/test/images", config1.path, function(err){
    ftp1.download(config1.path + "/images", "C:/test", function(err){
        console.log(arguments);
        console.timeEnd("time");
        end();
    });
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
//ftp1.cd(config1.path, function(){
    
//});


function end(){
    try{ftp1.close();}catch(e){}
}