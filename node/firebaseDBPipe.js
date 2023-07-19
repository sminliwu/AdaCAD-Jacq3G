/**
 * FILE: firebasePi.js
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set, onValue, push } = require("firebase/database");
const { EventEmitter } = require('stream');
const { Loom, boolStringToArray } = require('./jacq3g')
const { PedalServer } = require('./software/1_pedals/pedalServer_PC');
const { getFirebaseConfig } = require('./firebase-config.js');
const { DBWriter, DBListener, DBTwoWay, OnlineStatus, DBWriterArray, DBReadBuffer } = require('./DBNode.js');

/**
 * Wraps all DBNodes into a single object that represents the
 * loom/pedal/AdaCAD state in the database.
 */
class DBStatus extends EventEmitter {
    pi_online;     // is the pi online?
    loom_online;   // is the loom online?
    vacuum_on;     // is the loom running? (vacuum pump running)
    active_draft;
    num_pedals;
    pedal_states;
    loom_ready;
    num_picks;
    pick_data;

    pedal_array;    // DBWriterArray
    v_pedal_array;  // DBTwoWayArray

    constructor(db) {
        // console.log(db);
        super();
        const defaults = {
            pi_online: true,
            loom_online: false,
            vacuum_on: false,
            num_pedals: 0,
            pedal_states: false,
            loom_ready: false
        }
        const listeners = {
            active_draft: 'active-draft',
            num_picks: 'num-picks',
            // pick_data: 'pick-data'
        }

        const writers = {
            loom_online: 'loom-online',
            vacuum_on: 'vacuum-on',
            num_pedals: 'num-pedals',
            pedal_states: 'pedal-states',
            loom_ready: 'loom-ready'
        }

        function params(path, initVal) { 
            if (initVal !== undefined) { return { db: db, root: 'pedals/', path: path, initVal: initVal }; }
            else return { db: db, root: 'pedals/', path: path };
          };

        this.pi_online = new OnlineStatus(params('pi-online', defaults.pi_online));
        this.pi_online.attach();
        this.pi_online.setVal(true);

        for (var l in listeners) {
            // params.path = listeners[l];
            // params.initVal = defaults[l];
            var newL = new DBListener(params(listeners[l], defaults[l]));
            Object.defineProperty(this, l, { value: newL });
            this[l].attach();
        }
        
        this.pick_data = new DBReadBuffer(params('pick-data', false));
        this.pick_data.attach();
      
        for (var w in writers) {
            var newW = new DBWriter(params(writers[w], defaults[w]));
            Object.defineProperty(this, w, { value: newW });
            this[w].attach();
            this[w].setVal(defaults[w]);
        }

        this.pedal_array = new DBWriterArray(this.num_pedals, this.pedal_states, {});

        this.num_v_pedals = new DBTwoWay(params('num-v-pedals'));
        this.v_pedal_states = new DBTwoWay(params('v-pedal-states'));
        this.v_pedal_states.attach();
    }
}

const waiting = {
    none: -1,
    loom: 0,
    pick: 1,
    pedals: 2
}

class LoomPedalState {
    _pedals;
    _loom;
    _weaving;

    constructor() {
        this._loom = false;
        this._pedals = false;
        this._weaving = false;
        this.weavingState = -1;
    }

    get readyToWeave() { return this._pedals && this._loom}
    get weaving() { return this._weaving }
    set weaving(x) { 
        this._weaving = x;
        if (!x) { this.weavingState = waiting.none; }
        else { this.weavingState = waiting.pedals; } 
    }

    get waitingOnPedals() { return this.weaving == waiting.pedals }
    get waitingOnLoom() { return this.weaving == waiting.loom }
    get waitingOnPick() { return this.weaving == waiting.pick }

    nextWeavingStep() {
        if (this.weaving) {
            this.weavingState = (this.weavingState + 1) % 3;
        }
    }
}

// event handlers
const setLoomReady = () => this.loom_ready.setVal(true);
const sendDBPick = (pickData) => this.loom.sendPick(pickData);

/**
 * Makes sure that state of the loom and pedals 
 * are formatted and written correctly to database
 */
class DBPipe extends EventEmitter {
    db;
    dbstatus;
    /** @type {Loom} */
    loom;
    // pedals;
    lpstate;

    constructor(loomHandle, pedalsHandle) {
        super();
        const config = getFirebaseConfig();
        const app = initializeApp(config);
        
        this.db = getDatabase(app);
        this.lpstate = new LoomPedalState();

        // loom/pedal events -> DBwriter actions in methods
        this.loom = loomHandle;
        this.loom.on('connected', (e) => this.updateLoomOnline(e));
        // don't listen for other events if the loom is offline

        // DBlistener events -> loom/pedal actions
        // event handlers in methods
        this.dbstatus = new DBStatus(this.db);
        this.dbstatus.pi_online.on('change', (e) => this.keepAlive());
        this.dbstatus.active_draft.on('change', (e) => this.handleActiveDraft(e));
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
        // this.pedals.toggleRelay();
    }

    sendPick() {
        if (this.pick_data) {
            this.loom.sendPick(this.pick_data);
            this.pick_data = false;
            console.log("sent pick data ", this.loom.pickNumber);
            this.dbstatus.loom_ready.setVal(false);
        } else {
            console.log("no pick data to send");
        }
    }

    /** When the loom sends a pick request */
    handleLoomReady(dbstatus) {
        console.log("dbPipe: loom pick request");
        console.log("dbPipe: what data do I have", this.pick_data);
        if (this.pick_data) {
            console.log("dbPipe: pick data ready");
            this.loom.sendPick(this.pick_data);
        } else {
            console.log("dbPipe: waiting for pick data");
        }
        this.dbstatus.loom_ready.setVal(dbstatus);
    }

    handleActiveDraft(active) {
        // user starts weaving
        if (active) {
            // get the row currently in the buffer
            this.updatePickData(this.dbstatus.pick_data.val);
            this.loom.initialize();
            this.dbstatus.vacuum_on.setVal(true);

            // start listening for "loom ready" pick requests
            this.dbstatus.pick_data.on('change', (e) => {
                if (e) {
                    this.updatePickData(e);
                    if (this.dbstatus.loom_ready.val) {
                        this.sendPick();
                    }
                }
            });

            // Jacq loom does not use vacuum, more generic 'first-row-pls' event
            this.loom.once('vacuum', (e) => {
                this.sendPick();
                this.loom.on('pick-request', (e) => this.handleLoomReady(e));
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
        this.dbstatus.pi_online.setVal(true);
        console.log("dbPipe: stayin' alive");
    }
}

module.exports = {
    DBPipe,
    PedalServer
}

// true if this file is run via command line, but
// false if run by a require statement
if (require.main === module) {
    const loom = new Loom();
    const dbcon = new DBPipe(loom);

    dbcon.keepAlive();
}