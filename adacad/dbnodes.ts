import { child, ref, set, get, query, 
  onValue, onChildAdded, onChildChanged, onChildRemoved,
  push, remove,
  DatabaseReference, 
} from "firebase/database";
import { Database } from '@angular/fire/database';
import { EventEmitter } from 'events';

export interface NodeParams {
  db: Database,
  name: string,
  root: string,
  path: string,
  key?: string,
  initVal?: any,
  ref: DatabaseReference,
  id: number
}

export type NodeValue = string | boolean | number | { [key: string]: any };

interface NodeMethods {
  attach(): void,
  detach(): void,
}

/**
 * @class DBNode
 * @desc Wrapper for a Firebase database ref and
 * the value stored at that DB node.
 */
abstract class DBNode extends EventEmitter implements NodeMethods {
  id: number;
  key?: string;
  _name: string;
  _dbref: DatabaseReference;
  _val: NodeValue;
  _default: NodeValue;
  _active: boolean;

  /**
   * holds the Unsubscribe functions that are returned by
   * DB event functions like onValue(...)
   */
  unsubscribers: Array<Function>;

  /**
   * 
   * @param {NodeParams} params \{ db: Database, path: string, initVal: any }
   * @param {*} params \{ ref: DatabaseReference, key: string, initVal: any }
   */

  constructor(params: NodeParams) {
    super();
    this.active = false;
    this.unsubscribers = [];
    if (params.db) {
      this._name = params.path;
      this._dbref = ref(params.db, params.root + params.path);
      this._val = params.initVal;
      // console.log(this);
    } else if (params.ref) {
      this._name = params.key;
      this._dbref = params.ref;
    }

    if(params.id > -1) {
      this.id = params.id;
    }
    console.log(this.name);
  }

  get ref() { return this._dbref; }
  get name() { return this._name; }
  get val() {
    if (this.active) {
      if (typeof(this._val) == 'number' || typeof(this._val == 'boolean')) {
        return this._val;
      } 
      
      if (this._val != undefined) {
        return Object.keys(this._val);
      }
    }

    return false;
  }

  set val(x: NodeValue) {
    this._val = x;
  }

  get active() {
    return this._active;
  }

  set active(tf: boolean) {
    this._active = tf;
  }

  // methods for a node: 
  // attach() means it is updating with the database and emitting events
  // detach() means it is not updating, no events
  abstract attach();
  abstract detach();
  abstract read();
  abstract write(x: NodeValue);
}

type Keyed<Node extends DBNode> = Node & { key: string };

/**
 * @class DBListener
 * @desc A DBNode that only reads from the database.
 * When `active = true`, will emit events on the value changing.
 */
export class DBListener extends DBNode {
  id: number;
  key?: string;
  _name: string;
  _dbref: DatabaseReference;
  _val: any;
  _active: boolean;

  constructor(params: NodeParams) {
    super(params);
  }

  attach() {
    this.active = true;
    let unsub = onValue(this.ref, (snapshot) => {
      this.val = snapshot.val();
      this.emit('change', this.val);
    });
    this.unsubscribers.push(unsub);
  }

  getNow() {
    get(query(this.ref))
      .then((snapshot) => {
        this.val = snapshot.val();
      })
      .catch(result => console.log(result));
  }

  detach() {
    if (this.active) {
      while (this.unsubscribers.length > 0) {
        let unsub = this.unsubscribers.pop();
        unsub();
      }
    }
    this.active = false;
  }
}

/**
 * @class DBWriter
 * @desc A DBNode that only writes to the database. 
 * When `active = true`, will pass `val` to the database.
 */
export class DBWriter extends DBNode {
  id: number;
  key?: string;
  _name: string;
  _ref: DatabaseReference;
  _val: any;
  _active: boolean;

  constructor(params: NodeParams) {
    super(params);
  }

  attach() {
    this.active = true;
  }

  setVal(x) {
    this.val = x;
    if (this.active) {
      set(this.ref, this.val);
    }
  }

  detach() {
    this.active = false;
  }
}

/** Special DBWriter that expects the node to be cleared by the
 * other end upon receipt
 */
export class DBWriteBuffer extends DBWriter {
  id: number;
  _name: string;
  _ref: DatabaseReference;
  _val: any;
  _active: boolean;

  constructor(params: NodeParams) {
    super(params);
  }

  setVal(x) {
    get(query(this.ref))
      .then((snapshot) => {
        if(!snapshot.val()) {
          console.log("overwriting data in buffer");
        }
        super.setVal(x);
      })
      .catch(result => console.log(result));
  }
}

export class DBTwoWay extends DBNode {
  id: number;
  key?: string;
  _name: string;
  _dbref: DatabaseReference;
  _val: any;
  _active: boolean;

  constructor(params: NodeParams) {
    super(params);
  }
  
  attach() {
    this.active = true;
    let unsub = onValue(this.ref, (snapshot) => {
      this.val = snapshot.val();
      this.emit('change', this.val);
    });
    this.unsubscribers.push(unsub);
  }

  getNow() {
    get(query(this.ref))
      .then((snapshot) => {
        this.val = snapshot.val();
      })
      .catch(result => console.log(result));
  }
  
  detach() {
    if (this.active) {
      while (this.unsubscribers.length > 0) {
        let unsub = this.unsubscribers.pop();
        unsub();
      }
    }
    this.active = false;
  }
  
  setVal(x) {
    this.val = x;
    if (this.active) {
      set(this.ref, this.val);
    }
  }
}

class DBNodeArray extends EventEmitter {
  nodes: Array<DBNode>;
  lengthNode: DBNode;
  parentNode: DBNode;

  constructor(lengthNode, parentNode, init: any = {}) {
    super();
    this.lengthNode = lengthNode;
    this.parentNode = parentNode;
    if (init) {
    } else {
      this.nodes = [];
    }
  }

  get length() { return this.nodes.length; }

  get active() { return (this.lengthNode.active && this.parentNode.active); }

  get ready() { return (<number> this.lengthNode.val > 0 && this.parentNode.val != false); }

  nodeAt(n) {
    console.log(this.nodes);
    console.log("node at ", n);
    console.log(this.nodes[n]);
    return this.nodes[n];
  }

  pushNode(n) {
    this.nodes.push(n);
  }

  popNode() {
    return this.nodes.pop();
  }
}

/**
 * @class `DBListenerArray`
 * @desc Represents a listener to a list of values in the database 
 * (generalizes to `DBNodeArray`). Assumes that the data list is
 * structured such that `lengthNode` is a `DBListener` that stores the 
 * length of the list, while `parentNode` is a `DBListener` to the parent
 * node of the list. Each item in the list is a child of `parentNode`,
 * which is then stored as a `DBListener` in the array `nodes`.
 */
export class DBListenerArray extends DBNodeArray {
  lengthNode: DBListener;
  parentNode: DBListener;
  nodes: Array<DBListener>;

  /**
  * holds the Unsubscribe functions that are returned by
  * DB event functions like onValue(...)
  */
  unsubscribers: Array<Function>;

  constructor(lengthNode: DBListener, parentNode: DBListener) {
    super(lengthNode, parentNode);
    this.lengthNode = lengthNode;
    this.parentNode = parentNode;
    this.nodes = [];
    this.unsubscribers = [];
  }

  /**
   * @method attach
   */
  attach() {
    this.lengthNode.attach();
    this.lengthNode.on('change', (val) => {
        this.emit('ready', this.ready);
    });

    this.parentNode.attach();
    this.parentNode.once('change', (val) => {
      this.emit('ready', this.ready);
    });

    for (var node of this.nodes) {
      this.attachChildNode(node);
    }

    this.unsubscribers.push(
      onChildAdded(this.parentNode.ref, (snapshot) => {
        // console.log("child added", snapshot);
        this.addNode(snapshot.key);
    }));

    this.unsubscribers.push(
      onChildChanged(this.parentNode.ref, (snapshot) => {
        console.log("child changed", snapshot);
    }));

    this.unsubscribers.push(
      onChildRemoved(this.parentNode.ref, () => {
        // console.log("child removed", snapshot);
        let removed = this.popNode();
        this.emit('child-removed', removed);
    }));
  }

  detach() {
    if (this.active) {
      while (this.unsubscribers.length > 0) {
        let unsub = this.unsubscribers.pop();
        unsub();
      }
    }
  }

  nodeAt(n: number) {
    // console.log(this.nodes);
    // console.log("node at ", n);
    // console.log(this.nodes[n]);
    return this.nodes[n];
  }

  /**
   * Creating a new child node.
   * @param key 
   */
  addNode(key: string) {
    console.log('child key', key);
    const childRef = child(this.parentNode.ref, key);
    const childNode = new DBListener({ ref: childRef, key: key, id: this.length });
    this.attachChildNode(childNode);
    this.pushNode(childNode);
    this.emit('child-added', childNode);
    // this.lengthNode.setVal(this.length);
  }

  /**
   * Attaching a child node that was created elsewhere.
   * Invokes child's `attach()` method and adds event listener
   * that will emit a `child-change` event.
   * @param node 
   */
  attachChildNode(node: DBListener) {
    node.attach();
    node.on('change', (val) => {
      this.emit('child-change', {
        id: node.id,
        val: val
      });
    });
  }

  // remNode() {
  //   const node = this.popNode();
  //   // remove(node.ref);
  //   // this.lengthNode.setVal(this.length);
  // }

  // updateArray(num: number) {
  //   // this.parentNode.getNow();
  //   if (num > this.length) {
  //     let parentKeys = this.parentNode.val;
  //     // console.log(this.parentNode);
  //     console.log(parentKeys);
  //     let childKeys = Object.keys(parentKeys);
  //     while (this.length < num) {
  //       this.addNode(childKeys[this.length]);
  //     }
  //   } else if (num < this.length) {
  //     while (this.length > num) {
  //       this.popNode();
  //     }
  //   }
  //   console.log(this);
  // }

  toString() {
    var str = "";
    // str += "length: " + this.length + ", ";
    str += "[ \n";
    for (var i=0; i < this.nodes.length; i++) {    
      // str += "\t" + this.nodes[i].name + ": "; 
      str += this.nodes[i].val;
      if (i < this.nodes.length-1) {
        str += ",";
      }
      str += " \n";
    } 
    str += " ]";
    return str;
  }
}

const EMPTY_NODE_ARRAY = false;

export class DBWriterArray extends DBNodeArray {
  nodes: Array<DBWriter>;
  lengthNode: DBWriter;
  parentNode: DBWriter;

  constructor(lengthNode, parentNode, init) {
    super(lengthNode, parentNode, init);
    if (!init) {
      this.lengthNode.setVal(0);
      this.parentNode.setVal(EMPTY_NODE_ARRAY);
    }

    // console.log(this);
  }

  addNode(initVal) {
    const childRef = push(this.parentNode.ref, initVal);
    const childNode = new DBWriter({ ref: childRef, initVal });
    childNode.attach();
    this.pushNode(childNode);
    this.lengthNode.setVal(this.length);
  }

  remNode() {
    const node = this.popNode();
    remove(node.ref);
    this.lengthNode.setVal(this.length);
  }

  updateArray(num, newStates) {
    if (num > this.length) {
      while (this.length < num) {
        this.addNode(newStates[this.length]);
      }
    } else if (num < this.length) {
      while (this.length > num) {
        this.remNode();
      }
    }
  }

  setNode(i, x) {
    this.nodes[i].setVal(x);
  }

}

/**
 * Array of two-way DBNodes where both ends are listening for
 * changes AND may write to the DB -- such as the virtual pedals
 * where both AdaCAD and the Pi/PC can add virtual pedals
 */
export class DBTwoWayArray extends DBNodeArray {
  nodes: Array<DBTwoWay> = [];
  lengthNode: DBTwoWay;
  parentNode: DBTwoWay;

  /**
  * holds the Unsubscribe functions that are returned by
  * DB event functions like onValue(...)
  */
  unsubscribers: Array<Function>;

  constructor(lengthNode: DBTwoWay, parentNode: DBTwoWay, init?: Array<DBTwoWay>) {
    super(lengthNode, parentNode, init);
    this.unsubscribers = [];
    if (!init) {
      this.lengthNode.setVal(0);
      this.parentNode.setVal(EMPTY_NODE_ARRAY);
    }
  }

  addNode(initVal: any) {
    push(this.parentNode.ref, initVal);
    // const childNode = new DBTwoWay({ ref: childRef, initVal });
    // childNode.attach();
    // this.pushNode(childNode);
    // this.lengthNode.setVal(this.length);
    // console.log('child key', key);
  }

  onNodeAdded(key: string) {
     const childRef = child(this.parentNode.ref, key);
     const childNode = new DBTwoWay({ ref: childRef, key: key, id: this.length });
     this.attachChildNode(childNode);
     this.pushNode(childNode);
     this.lengthNode.setVal(this.length);
     this.emit('child-added', childNode);
  }

  remNode() {
    const lastNode = this.nodeAt(this.length-1);
    remove(lastNode.ref);
    // this.lengthNode.setVal(this.length);
  }

  onNodeRemoved() {
    let removed = this.popNode();
    this.lengthNode.setVal(this.length);
    return removed;
  }

  updateArray(num: number, newStates: Array<any>) {
    if (num > this.length) {
      while (this.length < num) {
        this.addNode(newStates[this.length]);
      }
    } else if (num < this.length) {
      while (this.length > num) {
        this.remNode();
      }
    }
  }

  setNode(i: number, x: any) {
    this.nodes[i].setVal(x);
  }

  /**
  * @method attach
  */
  attach() {
    this.lengthNode.attach();
    this.lengthNode.on('change', (val) => {
        this.emit('ready', this.ready);
    });

    this.parentNode.attach();
    this.parentNode.once('change', (val) => {
      this.emit('ready', this.ready);
    });

    for (var node of this.nodes) {
      this.attachChildNode(node);
    }

    this.unsubscribers.push(
      onChildAdded(this.parentNode.ref, (snapshot) => {
        // console.log("child added", snapshot);
        this.onNodeAdded(snapshot.key);
    }));

    this.unsubscribers.push(
      onChildChanged(this.parentNode.ref, (snapshot) => {
        console.log("child changed", snapshot);
    }));

    this.unsubscribers.push(
      onChildRemoved(this.parentNode.ref, () => {
        // console.log("child removed", snapshot);
        let removed = this.onNodeRemoved();
        this.emit('child-removed', removed);
    }));
  }
 
  detach() {
    if (this.active) {
      while (this.unsubscribers.length > 0) {
        let unsub = this.unsubscribers.pop();
        unsub();
      }
    }
  }

  /**
  * Attaching a child node that was created elsewhere.
  * Invokes child's `attach()` method and adds event listener
  * that will emit a `child-change` event.
  * @param node 
  */
  attachChildNode(node: DBListener) {
    node.attach();
    node.on('change', (val) => {
      this.emit('child-change', {
        id: node.id,
        val: val
      });
    });
  }
}

/** special types of DBNodes */

/** @class
 * OnlineStatus representing whether or not the
 * "host" device is online. The host device is responsible
 * for keeping the node set to "true", while any listener
 * devices check occasionally for the host's status by 
 * attempting to set the node to "false".
 */
export class OnlineStatus extends DBListener {
  _name: string;
  _ref: DatabaseReference;
  _val: boolean;
  _active: boolean;

  constructor(params) {
    super(params);
    this.attach();
    get(query(this.ref))
      .then((snapshot) => {
        this.val = snapshot.val();
      })
      .catch(result => console.log(result));
  }

  checkAlive() {
    set(this.ref, false)
      .then(() => { this.emit('set', true); })
      .catch(() => { this.emit('set', false); });
  }
}

