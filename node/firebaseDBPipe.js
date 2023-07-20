/**
* FILE: firebaseDBPipe.js
*/

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set, onValue, push } = require("firebase/database");
const { EventEmitter } = require('stream');
const { Loom, boolStringToArray } = require('./jacq3g')
const { getFirebaseConfig } = require('./firebase-config.js');
const { DBWriter, DBListener, DBTwoWay, OnlineStatus, DBWriterArray, DBReadBuffer } = require('./DBNode.js');

/**
* Wraps all DBNodes into a single object that represents the
* loom/pedal/AdaCAD state in the database.
*/
class DBStatus extends EventEmitter {
	loom_online;  // is the loom driver online?
	loom_ready;   // is the loom running? (ready to receive first pick)
	start_stop; 	// are we weaving?
	pick_req; 		// is the loom ready for the next pick?
	pick_data;
	
	constructor(db, id, rootNode = 'looms/') {
		// console.log(db);
		super();

		const loomPath = rootNode + id + '/';
		
		// const db_obj =  {
    //   id: this.loom_id,
    //   name: this.loom_name,
    //   "loom-online": false,
    //   "loom-ready": false,
    //   "pick-data": '',
    //   "pick-req": false,
    //   "start-stop": false,
    // };

		const nodes = {
			id: { path: 'id', type: 'two-way', 
			default: id },
			loom_online: { path: 'loom-online', 
			type: 'two-way', default: false },
			loom_ready: { path: 'loom-ready', 
			type: 'writer', default: false },
			name: { path: 'name', type: 'two-way', 
			default: "" },
			pick_data: { path: 'pick-data',
			type: 'read-buffer', default: "" },
			pick_req: { path: 'pick-req',
			type: 'two-way', default: false },
			start_stop: { path: 'start-stop',
			type: 'listener', default: false },
		}
		
		function params(node) { 
			return { db: db, root: loomPath, path: node.path, initVal: node.default };
		};
		
		for (let n in nodes) {
			const x = nodes[n];
			let newNode;
			switch (x.type) {
				case 'listener':
				newNode = new DBListener(params(x));
				break;
				case 'writer':
				newNode = new DBWriter(params(x));
				break;
				case 'two-way':
				newNode = new DBTwoWay(params(x));
				break;
				case 'online':
				newNode = new OnlineStatus(params(x));
				break;
				case 'read-buffer':
				newNode = new DBReadBuffer(params(x));
				break;
			}
			
			Object.defineProperty(this, n, { value: newNode });
			this[n].attach();
			if (x.type == 'writer') {
				this[n].setVal(x.default);
			}
		}
	}
}

/**
* Makes sure that state of the loom and pedals 
* are formatted and written correctly to database
*/
class DBPipe extends EventEmitter {
	db;
	dbstatus;
	/** @type {Loom} */
	loom;
	
	constructor(loomHandle, id) {
		super();
		const config = getFirebaseConfig();
		const app = initializeApp(config);
		
		this.db = getDatabase(app);
		
		// loom/pedal events -> DBwriter actions in methods
		this.loom = loomHandle;
		this.loom.on('connected', (e) => this.updateLoomOnline(e));
		this.loom.on('quit', () => this.emit('quit'));
		// don't listen for other events if the loom is offline
		
		// DBlistener events -> loom/pedal actions
		// event handlers in methods
		this.dbstatus = new DBStatus(this.db, id);
		this.dbstatus.loom_online.on('change', (e) => this.keepAlive());
		this.dbstatus.start_stop.on('change', (e) => this.handleStartStop(e));
		this.dbstatus.pick_data.on('change', (e) => this.readPickData(e));
		
		// external pedal
		// this.pedals.on('relay-ready', () => {
		//     // this.pedals.toggleRelay(); 
		//     this.dbstatus.v_pedal_states.on('change', (e) => {
		//         console.log('virtual pedal changed');
		//         this.pedals.toggleRelay();
		//     });
		// });
	}
	
	/** When loom goes online/offline */
	updateLoomOnline(dbstatus) {
		// console.log('dbPipe: loom connection established');
		this.dbstatus.loom_online.setVal(dbstatus);
	}
	
	readPickData() {
		this.dbstatus.pick_data.read();
		console.log("just read pick data");
		this.updatePickData(this.dbstatus.pick_data.val);

		// clear the pick_req node to indicate received
		this.dbstatus.pick_req.setVal(false);
		// this.pedals.toggleRelay();
	}
	
	sendPick() {
		if (this.pick_data) {
			this.loom.sendPick(this.pick_data);
			this.pick_data = false;
			console.log("sent pick data ", this.loom.pickNumber);
		} else {
			console.log("no pick data to send");
		}
		
		this.dbstatus.pick_req.setVal(true);
	}
	
	/** When the loom sends a pick request */
	handleLoomReady(dbstatus) {
		this.dbstatus.pick_req.setVal(dbstatus);
		console.log("dbPipe: loom pick request");
		console.log("dbPipe: what data do I have", this.pick_data);
		if (this.pick_data) {
			console.log("dbPipe: pick data ready");
			this.loom.sendPick(this.pick_data);
		} else {
			console.log("dbPipe: waiting for pick data");
		}
	}
	
	handleStartStop(active) {
		// user starts weaving
		if (active) {
			// get the row currently in the buffer
			console.log("starting to weave");
			this.updatePickData(this.dbstatus.pick_data.val);
			this.loom.initialize();
			this.dbstatus.loom_ready.setVal(true);
			
			// Jacq loom does not use vacuum, more generic 'active' event indicating ready for first pick
			this.loom.once('ready', () => {
				// this.sendPick();
				this.loom.on('pick-req', (e) => this.handleLoomReady(e));
			});

			// start listening for "loom ready" pick requests
			this.dbstatus.pick_data.on('change', (e) => {
				if (e) {
					this.updatePickData(e);
					// this.sendPick();
				}
			});
		} else {
			this.loom.end();
		}
	}
	
	/** data comes in as a string from DB */
	updatePickData(data) {
		console.log("dbPipe: updated pick data", data);
		if (data) {
			this.loom.heddles = boolStringToArray(data);
			this.loom.sendPick();
		}
	}
	
	/** Maintaining online status when running */
	keepAlive() {
		this.dbstatus.loom_online.setVal(true);
		console.log("dbPipe: stayin' alive");
	}

	signOff() {
		this.loom.end();
		this.dbstatus.loom_ready.setVal(false);
		this.dbstatus.loom_online.setVal(false);
	}
}

module.exports = {
	DBPipe,
}

// true if this file is run via command line, but
// false if run by a require statement
if (require.main === module) {
	const loom = new Loom();
	const dbcon = new DBPipe(loom);
	
	dbcon.keepAlive();
}