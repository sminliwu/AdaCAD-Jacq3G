// Jacq3G loom
/*
 	FILE/MODULE: socketClient.js
	re-implementation of Python files in loomConnection	
*/

const { EventEmitter } = require('stream');
const { SerialPort } = require('serialport');

/**
 * @desc Converting a string of 1's and 0's to an array of true/false
 * @param {String} str 
 */
function boolStringToArray(str) {
  return str.split('').map((x) => x == '1');
}

/**
 * @class Comm
 * @desc equivalent to jacq3g.py Comm(); replaces LoomTCPClient.js for TC2
 * 
 * @fires Comm#connected
 * @fires Comm#received
*/
class Comm extends EventEmitter {
	port;
	readBuffer;
	writeBuffer;

	constructor(loomHandle) {
		super();

		SerialPort.list().then(ports => {
      console.log(ports);
      // Figure which port to use...
      const port = ports[0]; // brute force just assume there's one port available
      port.baudRate = 115200; // from jacq3g.py
  
      // Instantiate an instance of transport class
      this.port = new SerialPort(port);
    }).then(() => {
      this.port.on('open', () => {
        this.emit('connected');
        this.port.on('data', (data) => {
          console.log("loom-comm: received data - ", Buffer.from(data, 'base64'));
          console.log(data.length + " bytes");
          this.readBuffer = data;

          /** 
           * @event Comm#received 
           * @type Buffer
           * @property the data received
           */
          this.emit('received', data);
        });

        this.port.on('close', (err) => {
          if (err) {
            console.log("port closed due to transmission error");
          }
        });

        this.port.on('error', (err) => {
          console.log(err.code);
        });      
      });
    });
	}

	send(data) {
		this.port.write(data);
	}

	end() {
		this.port.end();
	}
}

/**
 * @class Loom
 * @desc	Equivalent to Jacq3G in jacq3g.py
 * @emits Loom#connected
 * @emits Loom#ack
 * @emits Loom#pick-req
 */
class Loom extends EventEmitter {
	port;
	connected = false;
	comm;

	// loom config
  width = 360;
  frameSize = 120;

  // this is the 1's and 0's of each row, called "frames" in Python
  heddles = [];
  mask = [];
	
	threads; // boolean array

	// loom operation state
	pickNumber = 1; // number of draft rows sent to the loom
	
	// events for loom status changes

	constructor(width = 360, frameSize = 120, mask = false) {
    super();	

    this.width = width;
    this.frameSize = frameSize;
    if (mask) { this.mask = mask; }

    let middleFrameOnly = "".padEnd(120,'0').concat("".padEnd(120,'1')).concat("".padEnd(120,'0'));
    console.log(middleFrameOnly);
    this.mask = boolStringToArray(middleFrameOnly);

		this.comm = new Comm(this);
		this.comm.on('connected', 
			/** 
			 * @event Loom#connection
			 * @type boolean
			 */
			() => {
				this.emit('connected', true);
			});

		this.comm.on('received', 
			(data) => this.parseCommand(data));
    	
    // start the loom with a tabby pick
		while (this.heddles.length < this.width) {
      this.heddles.push(true, false);
    }
	}

  /**
   * 
   * @param {Array<Byte>} data 
   */
  send(data) {
		console.log('sending data: ', data)
		this.comm.send(data);
	}

  initialize() {
    this.send([0xc3]);
  }

  end() {
    this.send([0xc1]);
  }

  /**
   * Assuming array and mask are same length
   * @param {Array<boolean>} arr 
   */
  applyMask(arr, mask = this.mask) {
    // console.log(mask);
    return arr.map((x, i) => x && mask[i] );
  }

  getNullPick() {
    return Buffer.concat([0x80], this.toBytes('0'*this.frameSize,
    ), [0xc0, 0x81], 
    this.toBytes('0'*this.frameSize), [0xc0, 0x82],
    this.toBytes('0'*this.frameSize), [0xc0]);
  }

	parseCommand(data) {
    if (data[0] == 0xc3) {
      /**
       * @event Loom#vacuum
       * @type boolean
       * @desc loom connection successful
       */
      console.log("loom pinged back");
      this.emit('ack', true); // connection confirmation
    } else if (data[0] == 0x61 || data[0] == 0x63) {
      console.log("ready to receive pick");
      this.emit('pick-req');
    } else if (data[0] == 0x62) {
      // some sort of middle step when the shed is open?
      this.send([0xc1]);
    } else {
			console.log("unknown payload", Buffer.from(data, 'base64'));
		}
	}

	/**
	 * @method sendPick
	 * @param pick string of 1's and 0's
	 * @returns none
	*/
	sendPick(pick = this.heddles, mask = this.mask) {    
    // before sending pick, check that port is ready to write	

    let input = this.applyMask(pick, mask);
    	
    // convert pick array to bytes
    var pickBytes = this.pickToBytes(input);
    // send
    this.send(pickBytes);
    this.pickNumber++;
  }

  toBytes(arr = this.heddles) {
    let input = Array.from(arr);

    // seems like Jacq3g expects one empty bit per byte?
    while (input.length % 7 != 0) {
      input.push(false);
    }

    // console.log(input);

    let numBytes = input.length/7;
    let out = Buffer.alloc(numBytes);
    for (let i=0; i<numBytes; i++) {
      let x = i*7;
      let thisByte =
        input[x]<<6 |
        input[x+1]<<5 |
        input[x+2]<<4 |
        input[x+3]<<3 |
        input[x+4]<<2 |
        input[x+5]<<1 |
        input[x+6];
      out[i] = thisByte;
    }

    // console.log("converted bytes: " + out);
    return out;
  }

  tabby() {
    this.heddles = this.heddles.map( (x) => !x );
    console.log(this.heddles);
    this.sendPick();
  }

    /**
		 * @method pickToBytes
		 * @param {Array<boolean>} pick array (same as sendPick function)
		 * @returns Buffer\<bytes\>
    */
  pickToBytes(pick = this.heddles) {
    console.log("loomConn: converting pick: ", pick);
    console.log(Buffer.from([0x80]).length);
    let packedBytes = Buffer.concat([Buffer.from([0x80]),
      this.toBytes(pick.slice(0, 120)),
      Buffer.from([0xc0, 0x81]), 
      this.toBytes(pick.slice(120, 240)), 
      Buffer.from([0xc0, 0x82]),
      this.toBytes(pick.slice(240)),
      Buffer.from([0xc0])]);

    console.log("loomConn: packed draft row into bytes", packedBytes);
    return packedBytes;
  }
}

module.exports = {
  Comm,
  Loom,
  boolStringToArray,
}

if (require.main === module) {
  let loom = new Loom();

  loom.on('connection', (status) => {
    if (status) {
      loom.initialize();
      // loom.end();
      loom.tabby();
      // loom.sendPick(loom.frames);
  }});

  loom.on('pick-req', () => {
    // loom.end();
    loom.tabby();
  });
}