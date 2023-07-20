# AdaCAD-Jacq3G communication
A tiny driver to connect the AVL Jacq3 loom to [AdaCAD](https://github.com/UnstableDesign/AdaCAD/). Reimplemented original [Python version](https://github.com/textiles-lab/Jacq3G) in Node.JS to use existing loom driver software.

## Install

1. Clone repository.
2. Obtain `firebase-config.js` file and place in `/node` directory.
3. Open terminal and navigate to `/node` directory.
4. Run `npm install`.
5. If you don't already have AdaCAD installed, also install that.

## Run
1. Switch your AdaCAD repository to the `comms` branch.
2. Compile and run AdaCAD with `ng serve`.
3. Open AdaCAD in your browser, open the side toolbar (">>" button) and navigate to the `Settings` tab.
4. Click "Connect to Loom" and note the loom ID number that generates.
5. Actually physically connect the loom to your computer.
6. Open another terminal in the `/node` directory.
7. Run `node main.js [loom ID #]` with the brackets filled in with Step 4's ID number.

## File Descriptions

* `DBNode.js` -- classes for holding onto nodes in a Firebase realtime database for real-time loom-AdaCAD connection.
* `firebaseDBPipe.js` -- creates all of the required DB nodes to maintain loom status.
* `jacq3g.js` -- handles sending/receiving data with the Jacq3 loom.
