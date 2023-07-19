# AdaCAD-Jacq3G communication
A tiny driver to connect the AVL Jacq3 loom to [AdaCAD]([https://github.com/](https://github.com/UnstableDesign/AdaCAD/). Reimplemented original [Python version](https://github.com/textiles-lab/Jacq3G) in Node.JS to use existing loom driver software.

## Install

1. Clone repository.
2. Obtain `firebase-config.js` file and place in `/node` directory.
3. Open terminal and navigate to `/node` directory.
4. Run `npm install`.
5. Run `node main.js`

## File Descriptions

* `DBNode.js` -- classes for holding onto nodes in a Firebase realtime database for real-time loom-AdaCAD connection.
* `firebaseDBPipe.js` -- creates all of the required DB nodes to maintain loom status.
* `jacq3g.js` -- handles sending/receiving data with the Jacq3 loom.
