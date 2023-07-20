import { Injectable } from '@angular/core';
import { WeavingPick } from '../model/state';
import { EventEmitter } from 'events';
import { getDatabase } from "firebase/database";
import { Database } from '@angular/fire/database';
import { NodeParams,
  DBListener, OnlineStatus, DBWriter, 
  DBListenerArray, DBTwoWayArray, DBTwoWay } from '../model/dbnodes';

/**
 * The Pedals service is in charge of updating the database 
 * connections to communicate with the loom hardware. In AdaCAD, 
 * its main responsibility is to keep an up-to-date list of the pedals
 * and when they get stepped on; as well as any other hardware 
 * statuses.
 */

export interface Pedal {
  id: number,
  name: string,
  u_name?: string,
  key: string,
  dbnode: DBListener | DBTwoWay,
  state: any,
  // op?: Operation
}

/** 
 * Just a wrapper for how the database arranges the pedals + 
 * loom information into nodes
 */
export class PedalStatus extends EventEmitter {
  pi_online: OnlineStatus;     // is the pi online?
  loom_online: DBListener;   // is the loom online?
  vacuum_on: DBListener;     // is the loom running? (vacuum pump running)
  loom_ready: DBListener;

  active_draft: DBWriter;
  num_picks: DBWriter;
  pick_data: DBWriter;

  num_pedals: DBListener;
  pedal_states: DBListener;
  pedal_array: DBListenerArray;

  num_v_pedals: DBTwoWay;
  v_pedal_states: DBTwoWay;
  v_pedal_array: DBTwoWayArray;

  constructor(db: Database) {
    super();
    const defaults = {
      active_draft: false,
      num_picks: 0,
      pick_data: false
    }
    const listeners = {
      // pi_online: 'pi-online',
      loom_online: 'loom-online',
      vacuum_on: 'vacuum-on',
      num_pedals: 'num-pedals',
      pedal_states: 'pedal-states',
      loom_ready: 'loom-ready'
    }
    const writers = {
      active_draft: 'active-draft',
      num_picks: 'num-picks',
      pick_data: 'pick-data'
    }

    function params(path: string): NodeParams { 
      return { db: db, root: 'pedals/', path: path };
    };

    this.pi_online = new OnlineStatus(params('pi-online'));
    // this.pi_online.attach();
    // this.loom_online = new DBListener(this.db, 'loom-online');

    for (var l in listeners) {
      const newL = new DBListener(params(listeners[l]));
      Object.defineProperty(this, l, { value: newL });
      // this[l].attach();
    }

    for (var w in writers) {
      const newW = new DBWriter({...params(writers[w]), initVal: defaults[w]});
      // console.log('writer created');
      Object.defineProperty(this, w, { value: newW });
      // console.log('writer added to status');
      this[w].attach();
      // console.log('writer attached');
      this[w].setVal(defaults[w]);
    }

    // set up array of pedal listeners with the length and parent nodes
    this.pedal_array = new DBListenerArray(this.num_pedals, this.pedal_states);

    // set up virtual pedal nodes, which have their own length
    // and parent nodes
    this.num_v_pedals = new DBTwoWay(params('num-v-pedals'));
    this.v_pedal_states = new DBTwoWay(params('v-pedal-states'));
    this.v_pedal_array = new DBTwoWayArray(this.num_v_pedals, this.v_pedal_states);
  }

  toString() {
    var str = "";
    str += "'pi-online': " + this.pi_online.val + "\n";
    str += "'loom-online': " + this.loom_online.val + "\n\n";
    str += "'vacuum-on': " + this.vacuum_on.val + "\n";
    str += "'active-draft': " + this.active_draft.val + "\n";
    str += "'num-pedals': " + this.num_pedals.val + "\n";
    return str;
  }
}

/**
 * Definition of pedal service
 * @class
 * @event `pedal-added` data: how many pedals
 * @event `pedal-removed` data: how many pedals
 * @event `pedal-step` data: which pedal
 */
@Injectable({
  providedIn: 'root'
})
export class PedalsService extends EventEmitter {

  db: Database;
  dbNodes: Array<any>;

  // status data
  status: PedalStatus;
  //  default = {
  //     pi_online: false,     // is the pi online?
  //     loom_online: false,   // is the loom online?
  //     vacuum_on: false,     // is the loom running? (vacuum pump running)
  //     active_draft: false,
  //     num_pedals: 0,
  //     pedal_states: {},
  //     loom_ready: false     // is the loom requesting a draft row?
  // };
  p_pedals: Array<Pedal> = [];
  v_pedals: Array<Pedal> = [];
  
  virtual: boolean = true;  // whether to mix virtual pedals in with the regular pedals array;

  get pedals() { return this.p_pedals.concat(this.v_pedals); }

  constructor() { 
    super();
    // init: start listening to changes in Firebase DB from the Pi
    console.log("pedals service constructor");
    this.db = getDatabase();
    this.status = new PedalStatus(this.db);
    // console.log(this.status);
    
    // if pi_online = "true" at start-up, just make sure
    console.log("are you alive?");
    this.pi_online.checkAlive();
    this.loom_online.attach();

    this.virtualPedals(true);
    this.loomPedals(false);

    // listens for changes in pi online status
    // if online, enable everything
    this.pi_online.on('change', (state) =>
      this.loomPedals(state));

    // other listeners
    this.loom_online.on('change', (state) => 
      this.loomListeners(state));

    /** pedal array listeners */
    this.p_pedal_array.on('ready', (state) => 
      this.weavingWriters(state)
    );

    this.p_pedal_array.on('child-added', (newNode) => {
      console.log('pedals service: pedal added');
      this.p_pedals.push(this.nodeToPedal(newNode));
      this.v_pedals.map((el) => { el.id += 1; });
      this.emit('pedal-added', this.p_pedals.length);
    });

    this.p_pedal_array.on('child-removed', () => {
      this.p_pedals.pop();
      this.v_pedals.map((el) => { el.id -= 1; });
      this.emit('pedal-removed', this.p_pedals.length);
    });

    this.p_pedal_array.on('child-change', (e) => {
      this.p_pedals[e.id].state = e.val;
      this.emit('pedal-step', e.id);
      // e = {id: which pedal's id, val: pedal state}
      // call pedal.execute or whatever it ends up being
      // this.player.onPedal(e.id, e.val);
    });

    /** @todo */
    this.loom_ready.on('change', (state) => {
      if (state) {
        // send the next weaving row to DB
        // update num_picks and pick_data accordingly
      }
    });
    
    /** virtual pedal listeners */
    this.v_pedal_array.on('ready', (state) => {
      console.log("weaving writers ", state);
      this.weavingWriters(state);
    });

    this.v_pedal_array.on('child-added', (newNode) => {
      console.log('pedals service: virtual pedal added');
      let v = this.nodeToPedal(newNode);
      v.id += this.p_pedals.length - (this.p_pedals.length ? 1 : 0);
      this.v_pedals.push(v);
      this.emit('pedal-added', this.v_pedals.length);
    })

    this.v_pedal_array.on('child-removed', () => {
      this.v_pedals.pop();
      this.emit('pedal-removed', this.v_pedals.length);
    })

    this.v_pedal_array.on('child-change', (e) => {
      this.v_pedals[e.id].state = e.val;
      this.emit('pedal-step', e.id);
      // e = {id: which pedal's id, val: pedal state}
      // call pedal.execute or whatever it ends up being
      // this.player.onPedal(e.id, e.val);
    });
  }

  /** online status */
  get pi_online() { return this.status.pi_online; }
  get loom_online() { return this.status.loom_online; }

  /** weaving statuses */
  get vacuum_on() { return this.status.vacuum_on; }
  get active_draft() { return this.status.active_draft; }
  get loom_ready() { return this.status.loom_ready; }
  get num_picks() { return this.status.num_picks; }
  get pick_data() { return this.status.pick_data; }

  /** physical pedals DB nodes */
  get num_pedals() { return this.status.num_pedals; }
  get pedal_states() { return this.status.pedal_states; }
  get p_pedal_array() { return this.status.pedal_array; }

  /** virtual pedals DB nodes */
  get num_v_pedals() { return this.status.num_v_pedals; }
  get v_pedal_states() { return this.status.v_pedal_states; }
  get v_pedal_array() { return this.status.v_pedal_array; }
  
  get readyToWeave() { return (this.loom_online.val && (this.p_pedal_array.ready || this.v_pedal_array.ready)); }

  // attach all listeners to other values in DB
  loomPedals(state: boolean) {
    state ? this.p_pedal_array.attach() : this.p_pedal_array.detach();
  }

  /** functions to interact with virtual pedals */

  virtualPedals(state: boolean) {
    state? this.v_pedal_array.attach() : this.v_pedal_array.detach();
  }

  addVPedal() {
    this.v_pedal_array.addNode(false);
  }

  togglePedalByID(id: number) {
    console.log("toggling virtual pedal ", id);
    if (id >= 0 && id < this.v_pedals.length) {
      let val = this.v_pedal_array.nodes[id].val;
      this.v_pedal_array.setNode(id, !val);      
    }
  }

  togglePedal(p: Pedal) {
    console.log(this.v_pedal_array);
    console.log(this.v_pedals);
    this.togglePedalByID(p.id);
  }

  remVPedal() {
    this.v_pedal_array.remNode();
  }

  /** handling weaving state DB nodes */
  loomListeners(state: boolean) {
    if (state) {
      this.vacuum_on.attach();
      this.loom_ready.attach();
    } else {
      this.vacuum_on.detach();
      this.loom_ready.detach();
    }
    this.weavingWriters(this.readyToWeave);
  }

  weavingWriters(state: boolean) {
    if (state) {
      this.active_draft.attach();
      this.num_picks.attach();
      this.pick_data.attach();
    } else {
      this.active_draft.detach();
      this.num_picks.detach();
      this.pick_data.detach();
    }
  }

  /** lets the Pi know to start weaving */
  toggleWeaving() {
    // this.active_draft.attach();
    // console.log("toggle weaving");
    let vac = !this.vacuum_on.val;
    console.log("vacuum is turning ", vac);
    console.log(this.active_draft);
    this.active_draft.setVal(vac);
  }

  /** loads pick data into DB */
  sendDraftRow(r: WeavingPick) {
    this.num_picks.setVal(r.pickNum);
    this.pick_data.setVal(r.rowData);
  }

  /** utility function for formatting a DBNode into a Pedal */
  nodeToPedal(node: DBListener | DBTwoWay) {
    // console.log(node);
    let p: Pedal = { id: node.id, key: node.key, name: node.name, dbnode: node, state: node.val };
    return p;
  }
}
