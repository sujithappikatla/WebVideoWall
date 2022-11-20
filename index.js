const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require("fs");

const THRESH_IGNORANCE = 1;
var STATE = {
   video_timestamp: 0,
   last_updated: Math.round(Date.now() / 1000),
   playing: true,
   global_timestamp:  Math.round(Date.now() / 1000),
   src : "/video",
   client_id:0
}

var unique_id=1;

app.get('/', function(req, res) {
   res.sendFile(__dirname+'/public/index.html')
});

app.get('/script', function(req, res) {
   res.sendFile(__dirname+'/public/script.js')
});

app.get("/video", function (req, res) {
   const range = req.headers.range;
   if (!range) {
       res.status(400).send("Requires Range header");
   }
   const videoPath = __dirname+"/public/test_720.mp4";
   const videoSize = fs.statSync(videoPath).size;
   const CHUNK_SIZE = 100 ** 6;
   const start = Number(range.replace(/\D/g, ""));
   const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
   const contentLength = end - start + 1;
   const headers = {
       "Content-Range": `bytes ${start}-${end}/${videoSize}`,
       "Accept-Ranges": "bytes",
       "Content-Length": contentLength,
       "Content-Type": "video/mp4",
   };
   res.writeHead(206, headers);
   const videoStream = fs.createReadStream(videoPath, { start, end });
   videoStream.pipe(res);
});

//Whenever someone connects this gets executed
io.on('connection', function(socket) {
   console.log('A user connected');
   socket.emit("state_update_from_server", {...STATE, "client_id":unique_id++});


   //Whenever someone disconnects this piece of code executed
   socket.on('disconnect', function () {
      console.log('A user disconnected');
   });

   socket.on('time_sync_request_backward', function() {
      const secondsSinceEpoch = Math.round(Date.now() / 1000)
      socket.emit("time_sync_response_backward",secondsSinceEpoch);
   });

   socket.on("time_sync_request_forward", function(time_at_client){
      const secondsSinceEpoch = Math.round(Date.now() / 1000)
      socket.emit("time_sync_response_forward",secondsSinceEpoch - time_at_client);
   });

   socket.on("sync_state", function(){
      io.emit("state_update_from_server", STATE);
   })


   socket.on("state_update_from_client", function(new_state){

      too_soon = (Math.round(Date.now() / 1000) - STATE["last_updated"]) < THRESH_IGNORANCE;
	   other_ip = (new_state["client_id"] != STATE["client_id"])
	   stale = (new_state["last_updated"] < STATE["last_updated"])

      if((too_soon && other_ip) || stale)
      {
         console.log("Skip update");
         return;
      } 

      STATE = new_state;
      console.log(STATE);
      socket.broadcast.emit("state_update_from_server", STATE);
   });
});



http.listen(3000, function() {
   console.log('listening on *:3000');
});


