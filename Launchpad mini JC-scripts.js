// eslint-disable-next-line no-var
var JCController = {};

const colorCode = function(color)
{
    return {
        black: 4,
        lo_red: 1 + 4,
        mi_red: 2 + 4,
        hi_red: 3 + 4,
        lo_green: 16 + 4,
        mi_green: 32 + 4,
        hi_green: 48 + 4,
        lo_amber: 17 + 4,
        mi_amber: 34 + 4,
        hi_amber: 51 + 4,
        hi_orange: 35 + 4,
        lo_orange: 18 + 4,
        hi_yellow: 50 + 4,
        lo_yellow: 33 + 4,

    }[color]
};

const getMIDI = function(column,line) {
	return (column-1) + 16*(line-1)
}

JCController.SAMPLERS = 8;

const getPlayedBPM = function() {
	if (engine.getParameter("[Channel1]", "play")==1) { //first we look at channel 1
    	var bmp_playing = engine.getValue("[Channel1]", "bpm")
    } else if (engine.getParameter("[Channel2]", "play")==1) { //otherwise we look at channel 2
    	var bmp_playing = engine.getValue("[Channel2]", "bpm")
    } else { //none of them were playing, we cannot sync BMP in this case
    	var bmp_playing = null
    }
    return bmp_playing
}

//function to set the track BMP sync led color based on sync status
BPM_sync_LED = function (_value, group, _control) {
	line = (group[8]-1)*16 //get the line on the pad from the group#
	key = 8+line
	//console.log("BPM_sync_LED")
	//console.log(_value)
	//console.log(group)
	//console.log(_control)
	const bmp_playing = getPlayedBPM()
	const sampler_actual_bmp  = engine.getValue(group, "bpm");
	//console.log(bmp_playing," vs. ",sampler_actual_bmp)
	var color = null;
    if (bmp_playing == null ) {
    	color = 'black';
    } else if (sampler_actual_bmp == bmp_playing) { //BMPs are synched
    	color = 'hi_green';
	} else { //BMPs are NOT synched. The action is to sync
    	color = 'hi_red'
    }
    midi.sendShortMsg(0x90, key, colorCode(color));
}

JCController.init = function (id, debugging) {
	//clears the pad
	midi.sendShortMsg(0xB0, 0x00, 0x00);

	//functions
	// 1 PLAY FROM START/STOP
	// 2 STOP
	// 3 HOTCUE1
	// 4 HOTCUE2
	// 5 HOTCUE3
	// 6 HOTCUE4
	// 7 PREGAIN DOWN
	// 8 PREGAIN UP
	// O SYNC BPM TO PLAYING TRACK

	//function to set the PLAY led color based on play status and/or if a track is loaded
	const togglePlayButtonColor = function (_value, group, _control) {
		line = (group[8]-1)*16 //get the line on the pad from the group#
		//console.log("togglePlayButtonColor")
		//console.log(_value)
		//console.log(group)
		//console.log(_control)
    	if (engine.getParameter(group, "track_loaded")==1) {
	    	if (engine.getParameter(group, "play")==1) {
	    		midi.sendShortMsg(0x90, 0+line, colorCode('hi_green'));
	    		midi.sendShortMsg(0x90, 1+line, colorCode('hi_red'));
	       	} else {
	    		midi.sendShortMsg(0x90, 0+line, colorCode('hi_yellow'));
	    		midi.sendShortMsg(0x90, 1+line, colorCode('lo_red'));
	    	}
	    	
	    	BPM_sync_LED(_value, group, _control)
	    } else {
	    	midi.sendShortMsg(0x90, 0+line, colorCode('black'));
	    }
	};
	
	//when track is ejected, clear all hotcue leds
	const track_ejected = function (_value, group, _control) {
		line = (group[8]-1)*16 //get the line on the pad from the group#
		//console.log("track_ejected")
		//console.log(group)
		//console.log(deck)
		//console.log(line)
		for (var i=0; i<JCController.SAMPLERS+1 ; i++) {
			midi.sendShortMsg(0x90, i+line, colorCode('black'));
		}
		//midi.sendShortMsg(0x90, 2+line, colorCode('black'));
		//midi.sendShortMsg(0x90, 3+line, colorCode('black'));
		//midi.sendShortMsg(0x90, 4+line, colorCode('black'));
		//midi.sendShortMsg(0x90, 5+line, colorCode('black'));
		//togglePlayButtonColor(_value, group, _control);
		//BPM_sync_LED(_value, group, _control);
	}

	//when track is ejected, setup leds is hotcus is active
	const track_loaded = function (_value, group, _control) {
		line = (group[8]-1)*16 //get the line on the pad from the group#
		track_ejected(_value, group, _control)
		for (var i=1;i<=4;i++ ) {
			console.log("hotcue_"+i+"_status",",",engine.getParameter(group, "hotcue_"+i+"_status"))
			if (engine.getParameter(group, "hotcue_"+i+"_status")==1) {
				midi.sendShortMsg(0x90, 1+i+line, colorCode('hi_green'));
			}
		}
		togglePlayButtonColor(_value, group, _control)
	}

	for (var i=1;i<=JCController.SAMPLERS;i++) {
		sampler = "[Sampler" + i + "]"
		engine.makeConnection(sampler, 'play', togglePlayButtonColor);
		engine.makeConnection(sampler, 'track_loaded', track_loaded);
		engine.makeConnection(sampler, 'eject', track_ejected);
		engine.makeConnection(sampler, 'bpm', BPM_sync_LED);//
	}

	//timer for backround refresh and sync
	JCController.displayrefresh = engine.beginTimer(1000, JCController.maintimer);

};

JCController.shutdown = function() {
   	midi.sendShortMsg(0xB0, 0x00, 0x00);
}

JCController.play = function (_channel, _control, value, _status, group) {
    //console.log(_channel);
    //console.log(_control);
    //console.log(value);
    //console.log(_status);
    ////console.log("_group",_group);

    // some example code that only makes use of `value`.
    if (value === 0x7F) { //only if PUSH (not UP)
    	engine.setParameter(group, "playposition",0); //resets position to beginning of the track
    	script.toggleControl(group, "play");
	}
	//
	//if (engine.getParameter("[Sampler1]", "play")==0) {
	//    	engine.setParameter("[Sampler1]", "play", 1)
	//    } else {
	//    	engine.setParameter("[Sampler1]", "play", 0)
	//    }
	//}
}

JCController.tempo = function (_channel, _control, value, _status, group) {
    console.log("tempo",_channel,",",_control,",",value,",",_status,",",group);
    if (value === 0x7F) { //only if PUSH (not UP)
    	bmp_playing = getPlayedBPM()
	    //console.log("bmp_playing = ",bmp_playing);
	    //console.log("bpm = ",engine.getParameter(group, "bpm"));
	    //console.log("bpmV = ",engine.getValue(group, "bpm"));
	    //console.log("visual_bpm = ",engine.getParameter(group, "visual_bpm"));
	    if (bmp_playing!= null) { //we have a playing BMP
	    	var sampler_default_bmp = engine.getValue(group, "local_bpm");
	    	var sampler_actual_bmp  = engine.getValue(group, "bpm");
	    	//console.log("sampler_actual_bmp = ",sampler_actual_bmp);
	    	//console.log("bmp_playing = ",bmp_playing);
	    	//console.log("rate = ",engine.getParameter(group, "rate"));
	    	if (sampler_actual_bmp == bmp_playing) { //BMPs are synched. The action resets BPM to sample default
	    		//console.log("on remet à zero");
	    		engine.setParameter(group, "rate",0.5);
	    	} else { //BMPs are NOT synched. The action is to sync
	    		//console.log("on sync");
	    		//engine.setValue(group, "beatsync_tempo",1);
	    		engine.setValue(group, "bpm",bmp_playing);
	    		engine.setValue(group, "quantize",1);
	    	}
	    } else { //no track is playing, we reset the sampler BPM
	    	engine.setParameter(group, "rate",0.5);
	    }
    }
}

JCController.blinkON = true;
JCController.blinktimer = 0;
JCController.maintimer = function() {
	//console.log("blink",JCController.blinkON,",",JCController.blinktimer);
	//if (JCController.blinkON) {
	//	color='hi_red'
	//} else {
	//	color='hi_green'
	//}
	//JCController.blinkON = !JCController.blinkON;
	//midi.sendShortMsg(0x90, 0x77, colorCode(color));
	for (var i=1;i<=JCController.SAMPLERS;i++) {
		sampler = "[Sampler" + i + "]"
		if (engine.getParameter(sampler, "track_loaded")==1) {
			BPM_sync_LED(null, sampler, null)
		}
	}

}
   
JCController.pregain = function (_channel, control, value, _status, group) {
	console.log("test",_channel,",",control,",",value,",",_status,",",group);
	key = control%16
    if (value === 0x7F) {
    	if (key==6) {
    		direction = '_down'
    	} else if (key==7) {
    		direction = '_up'
    	}
    	volume = engine.getValue(group,"volume")
    	//console.log("before volume : ",volume);
    	script.triggerControl(group, "pregain"+direction);
    	volume = engine.getValue(group,"volume")
    	//console.log("after volume : ",volume);
        }
};