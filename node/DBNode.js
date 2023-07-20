/**
 * DBNode.js
 */

 const { ref, get, push, remove, set, onValue,
  onChildAdded, onChildChanged, onChildRemoved
 } = require("firebase/database");
 const { EventEmitter } = require('stream');

 /**
  * Basic DBNode which mirrors a node in the realtime database
  * maintaining a reference to the node and what value it holds
  */
 class DBNode extends EventEmitter {
  _name;   // path string
  _dbref;    // DatabaseReference
  _val;    // data @ path

  // params = { db, root, path, initVal }
  // OR   = { ref, key, initVal }
  /**
   * 
   * @param {*} params \{ db, root, path, initVal }
   * @param {*} params \{ ref, key, initVal }
   */
  constructor(params) {
      super();
      if (params.db) {
        // console.log(params.path);
        // console.log(db);
        this._name = params.path;
        this._dbref = ref(params.db, params.root + params.path);
        // console.log(this.ref);
        this._val = params.initVal;
      } else if (params.ref) {
        // console.log(params.key);
        this._name = params.key;
        this._dbref = params.ref;
      }
  }

  get ref() {
    return this._dbref;
  }

  get name() {
    return this._name;
  }

  get val() {
    return this._val;
  }

  set val(x) {
    this._val = x;
  }
}

/**
 * A type of DBNode that will listen for changes at the node
 * and emit events when that happens. DBListeners and DBWriters
 * are intended to be used in pairs, with one device having a 
 * Listener to a node where another device has a Writer.
 */
class DBListener extends DBNode {
  constructor(params) {
      super(params);
      this._val = "01010101010101010101010101010101010101010101";
      // console.log(this.ref);
      // this.onChange = new EventEmitter();
  }

  attach() {
      // console.log(this.ref);
      get(this.ref).then((snapshot) => {
        // console.log("db listener class: ", snapshot);
        this.val = snapshot.val();
        // console.log(this.val);
      });
      const detach = onValue(this.ref, (snapshot) => {
          this.val = snapshot.val();
          this.emit('change', this.val);
      });

      Object.defineProperty(this, 'detach', {value: detach});
  }

  detach() {}
}

/**
 * Type of DBNode that will write values to its node.
 * DBListeners and DBWriters are intended to be 
 * used in pairs, with one device having a 
 * Listener to a node where another device has a Writer.
 */
class DBWriter extends DBNode {
  constructor(params) {
      super(params);
      // onSetCompleted = new EventEmitter();
  }

  attach() {
      const setVal = (x) => {
          this.val = x;
          set(this.ref, this.val)
              .then(() => { this.emit('set', true); })
              .catch(() => { this.emit('set', false); });
      }
      Object.defineProperty(this, 'setVal', {value: setVal});
      Object.defineProperty(this, 'detach', 
      { value: () => delete this.setVal});
  }

  setVal(x) {}
  detach() {}
}

class DBTwoWay extends DBNode {
  // id: number;
  // key?: string;
  // _name: string;
  // _dbref: DatabaseReference;
  // _val: any;
  // _active: boolean;

  constructor(params) {
    super(params);
    this.unsubscribers = [];
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

/** 
 * Type of DBNode that represents whether or not a device
 * (the "host") is connected to the database. If a device
 * is the host of this Node, then it will keep the node
 * set to "true" (and other devices checking the status
 * will attempt to set the node as "false")
 */
class OnlineStatus extends DBNode {
  constructor(params, host = true) {
      super(params);
      this.host = host;
  }

  attach() {
    const detachDB = onValue(this.ref, (snapshot) => {
      this.val = snapshot.val();
      this.emit('change', this.val);
    });

    if (this.host) {
      const setVal = (x) => {
        this.val = x;
        set(this.ref, this.val)
          .then(() => { this.emit('set', true); })
          .catch(() => { this.emit('set', false); });
      }
      Object.defineProperty(this, 'setVal', { value: setVal });
      Object.defineProperty(this, 'detach', { value: () => {
        detachDB;
        delete this.setVal;
      }});
    }
  }
  
  setVal(x) {}
  detach() {}
}

/**
 * Type of DBNode much like DBListener, but clears
 * the node (sets it to false) when data changes,
 * like taking a message from a buffer
 */
class DBReadBuffer extends DBNode {
  constructor(params) {
    super(params);
    this.val = "";
    this.active = false;
  }
  
  attach() {
    get(this.ref).then((snapshot) => {
      // console.log("db read buffer: ", snapshot);
      this.val = snapshot.val();
      console.log(this.val);
    });
    const detachDB = onValue(this.ref, (snapshot) => {
      if (snapshot.val()) {
        console.log("dbnode: buffer data changed", snapshot.val());
        this.val = snapshot.val();
        this.emit('change', this.val);
        // clear the buffer
        // console.log("db read buffer: ", this.val);
        set(this.ref, false)
        .then(() => { this.emit('clearing', true); })
        .catch(() => { this.emit('clearing', false); });
      } else {
        this.emit('cleared');
      }
    });

    Object.defineProperty(this, 'detach', { value: () => {
      detachDB;
      this.active = false;
    }});

    this.active = true;
  }

  read() {
    if (this.active) {
      get(this.ref).then((snapshot) => {
        // console.log("db read buffer: ", snapshot);
        if (snapshot.val()) {
          this.val = snapshot.val();
          console.log("read value: ", this.val);
        } else { console.log("no data in buffer"); }
      })
      .then(() => { set(this.ref, false); });
    }
  }

  detach() {}
}

/**
* @class DBNodeArray
* @desc An object representing DBNodes that correspond to an array
* e.g. an array of loom pedals in the database would look like
*  > ```num-pedals: 3,```
*  >
*  > ```pedal-states: {```
*  >
*  >> ```   "0": true,```
*  >>
*  >> ```   "1": false,```
*  >>
*  >> ```   "2": true```
*  >
*  > `}`
*/
class DBNodeArray extends EventEmitter {
  constructor(lengthNode, parentNode, init = {}) {
      super();
      this.lengthNode = lengthNode;
      this.parentNode = parentNode;
      if (init.length) {
      } else {
        this.nodes = [];
      }
  }

  get length() {
    return this.nodes.length;
  }

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

const EMPTY_NODE_ARRAY = false;

/**
 * Array of DB writer nodes, used to update DB with pedal states
 */
class DBWriterArray extends DBNodeArray {
  constructor(lengthNode, parentNode, init) {
    super(lengthNode, parentNode, init);
    if (!init.length) {
      this.lengthNode.setVal(0);
      this.parentNode.setVal(EMPTY_NODE_ARRAY);
    }

    // console.log(this);
  }

  addNode(initVal) {
    const childRef = push(this.parentNode.ref, initVal);
    const childNode = new DBWriter({ node: this.parentNode, ref: childRef, initVal });
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

class DBTwoWayArray extends DBNodeArray {
  constructor(lengthNode, parentNode, init) {
    super(lengthNode, parentNode, init);
    this.unsubscribers = [];
    if (!init) {
      this.lengthNode.setVal(0);
      this.parentNode.setVal(EMPTY_NODE_ARRAY);
    }
  }

  addNode(initVal) {
    push(this.parentNode.ref, initVal);
    // const childNode = new DBTwoWay({ ref: childRef, initVal });
    // childNode.attach();
    // this.pushNode(childNode);
    // this.lengthNode.setVal(this.length);
    // console.log('child key', key);
  }

  onNodeAdded(key) {
     const childRef = child(this.parentNode.ref, key);
     const childNode = new DBListener({ ref: childRef, key: key, id: this.length });
     this.attachChildNode(childNode);
     childNode.on('change', () => this.emit('child-changed'));
     this.pushNode(childNode);
     this.emit('child-added', childNode);
     // this.lengthNode.setVal(this.length);
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
        this.emit('child-changed', snapshot);
        console.log("child changed", snapshot);
    }));

    this.unsubscribers.push(
      onChildRemoved(this.parentNode.ref, () => {
        // console.log("child removed", snapshot);
        this.popNode();
        this.emit('child-removed');
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
  attachChildNode(node) {
    node.attach();
    node.on('change', (val) => {
      this.emit('child-change', {
        id: node.id,
        val: val
      });
    });
  }
}

module.exports = {
  DBListener,
  DBWriter,
  DBTwoWay,
  DBReadBuffer,
  OnlineStatus,
  DBWriterArray,
  DBTwoWayArray,
}