# AdaCAD-Jacq3G communication
A tiny driver to connect the AVL Jacq3 loom to [AdaCAD]([https://github.com/](https://github.com/UnstableDesign/AdaCAD/). Reimplemented original [Python version](https://github.com/textiles-lab/Jacq3G) in Node.JS to use existing loom driver software.

## Install

1. Clone repository.
2. Obtain `firebase-config.js` file and place in `/node` directory.
3. Open terminal and navigate to `/node` directory.
4. Run `npm install`.
5. Run `node main.js`

## File Descriptions

* `DBNode.js` -- classes for holding onto a Firebase realtime database for real-time loom-AdaCAD connection.
