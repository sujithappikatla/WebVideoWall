const vid = document.querySelector("video");
const vid_src = document.getElementById("running_src");
const socket = io(window.location.href);

var side = null;

window.onload = () => {
  const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
  });
  let value = params.d;
  console.log("value: " + value);
  side = value;
  vid.style.left = value == "l" ? "50%" : "-50%";
};

const PLAYING_THRESH = 0.1;
const PAUSED_THRESH = 0.01;

let src = null;
let video_playing = null;
let last_updated = 0;
let client_id = null;

//Clock synchronisation related variables
const num_time_sync_cycles = 1000;
let over_estimates = new Array();
let under_estimates = new Array();
let over_estimate = 0;
let under_estimate = 0;
let correction = 0;

// connection event, sever sends a state update whenever a new connection is made
socket.on("connect", () => {
  console.log("Socket connection establised to the server");
  do_time_sync();
});

// disconnection event
socket.on("disconnect", () => {
  console.log("got disconnected");
});

function pause_seek_play() {
    var sts = [false, false, true];

    sts.forEach((value) => {
        
        last_updated = get_global_time(correction);
        var state_image = {
          video_timestamp: vid.currentTime,
          last_updated: last_updated,
          playing: value,
          global_timestamp: get_global_time(correction),
          src: vid_src.src,
          client_id: client_id,
        };
        socket.emit("state_update_from_client", state_image);
    })

  
  console.log("Emitted");
}

socket.on("state_update_from_server", (state) => {
  // Whenever the client connects or reconnects
  if (client_id == null) {
    client_id = state.client_id;
    if (side == "l") {
      setInterval(() => {
        // socket.emit("sync_state");
        // last_updated = get_global_time(correction);
        // var state_image = {
        //   video_timestamp: vid.currentTime,
        //   last_updated: last_updated,
        //   playing: video_playing,
        //   global_timestamp: get_global_time(correction),
        //   src: vid_src.src,
        //   client_id: client_id,
        // };
        // socket.emit("state_update_from_client", state_image);
        // console.log("Emitted");

        pause_seek_play()
      }, 5000);
    }
    // setInterval(() => {
    //     // socket.emit("sync_state");
    //     last_updated = get_global_time(correction)
    //     var state_image = {
    //         video_timestamp: vid.currentTime,
    //         last_updated: last_updated,
    //         playing: video_playing,
    //         global_timestamp: get_global_time(correction),
    //         src : vid_src.src,
    //         client_id:client_id
    //     }
    //     socket.emit("state_update_from_client", state_image)
    //     console.log("Emitted");
    // }, 2000);
  }

  // someone changed the video
  // if (vid_src.src !== state.src){
  // 	vid.pause()
  // 	// vid_src.src = state.src
  // 	vid.load()
  // }

  // calculating the new timestamp for both cases - when the video is playing and when it is paused
  let proposed_time = state.playing
    ? state.video_timestamp -
      state.global_timestamp +
      get_global_time(correction)
    : state.video_timestamp;
  let gap = Math.abs(proposed_time - vid.currentTime);
  // let gap = (proposed_time - vid.currentTime)

  console.log(
    `%cGap was ${proposed_time - vid.currentTime}`,
    "font-size:12px; color:purple"
  );
  console.log(state.playing);
  if (state.playing) {
    if (gap > PLAYING_THRESH) {
      // tolerance while the video is playing
      vid.currentTime = proposed_time;
    }
    console.log("playig");
    vid.play();
    video_playing = true;
  } else {
    vid.pause();
    video_playing = false;
    if (gap > PAUSED_THRESH) {
      // condition to prevent an unnecessary seek
      vid.currentTime = proposed_time;
    }
  }
});

let state_change_handler = (event) => {
  console.log(event.type);
  if (event !== null && event !== undefined) {
    if (event.type === "pause") {
      video_playing = false;
    } else if (event.type === "play") {
      video_playing = true;
    }
  }
  last_updated = get_global_time(correction);
  var state_image = {
    video_timestamp: vid.currentTime,
    last_updated: last_updated,
    playing: video_playing,
    global_timestamp: get_global_time(correction),
    src: vid_src.src,
    client_id: client_id,
  };
  socket.emit("state_update_from_client", state_image);
};

// assigning event handlers
vid.onseeking = state_change_handler;
vid.onplay = state_change_handler;
vid.onpause = state_change_handler;

// handling the video ended case separately
vid.onended = () => {
  video_playing = false;
  last_updated = get_global_time(correction);
  vid.load();
  state_change_handler();
};

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  values.sort((x, y) => x - y);
  let half = Math.floor(values.length / 2);
  if (values.length % 2) {
    return values[half];
  }
  return (values[half - 1] + values[half]) / 2.0;
}

function get_global_time(delta = 0) {
  let d = new Date();
  let t = d.getTime() / 1000;
  // delta is the correction parameter
  return t + delta;
}

let do_time_sync_one_cycle_backward = () => {
  socket.emit("time_sync_request_backward");
};
let do_time_sync_one_cycle_forward = () => {
  socket.emit("time_sync_request_forward", get_global_time(0));
};
function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// time requests are made every second
let do_time_sync = async () => {
  console.log("do_time_sync");
  for (let i = 0; i < num_time_sync_cycles; i++) {
    await timeout(1000);
    do_time_sync_one_cycle_backward();
    await timeout(1000);
    do_time_sync_one_cycle_forward();
  }
};

socket.on("time_sync_response_backward", (time_at_server) => {
  under_estimate_latest = time_at_server - get_global_time(0);
  under_estimates.push(under_estimate_latest);
  under_estimate = median(under_estimates);
  correction = (under_estimate + over_estimate) / 2;
  console.log(
    `%c Updated val for under_estimate is ${under_estimate}`,
    "color:green"
  );
  console.log(
    `%c New correction time is ${correction} seconds`,
    "color:red; font-size:12px"
  );
});

socket.on("time_sync_response_forward", (calculated_diff) => {
  over_estimate_latest = calculated_diff;
  over_estimates.push(over_estimate_latest);
  over_estimate = median(over_estimates);
  correction = (under_estimate + over_estimate) / 2;
  console.log(
    `%c Updated val for over_estimate is ${over_estimate}`,
    "color:green"
  );
  console.log(
    `%c New correction time is ${correction} seconds`,
    "color:red; font-size:12px"
  );
});
