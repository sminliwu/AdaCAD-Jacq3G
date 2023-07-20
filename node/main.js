// when running, requires an ID number

const process = require('node:process');
const { createInterface } = require('node:readline');

const { Loom } = require('./jacq3g.js');
const { DBPipe } = require('./firebaseDBPipe.js');

const ask = createInterface({
  input: process.stdin,
  output: process.stdout,
})
let loomID, loomName;

if (process.argv.length > 2) {
  loomID = process.argv[2];
  if (process.argv.length > 3) {
    loomName = process.argv[3];
  } else { loomName = ""; }
} else {
  console.error("ERROR: You must provide a loom ID number.");
  process.exit(1);
  //   if (parseInt(id) > 0) {
  //     loomID = id;
  //   } else {
  //     console.log("Try again.");
  //   }
  // });
}

const loom = new Loom();
const dbcon = new DBPipe(loom, loomID);

function quit() { dbcon.signOff(); process.exit(); }

dbcon.on('quit', () => quit());

// process.stdin.on('line', (e) => {
//   console.log(e);
//   switch (e) {
//     case 'q': quit();
//     default:
//       console.log("IDK what that means");
//       break;
//   }
// })