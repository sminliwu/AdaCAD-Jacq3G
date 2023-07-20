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
5. Actually physically connect the loom to your computer with the USB cable.
6. Open another terminal in the `/node` directory.
7. Run `node main.js ####`, replacing `####` with the ID number from Step 4.

### Trouble with COM ports? (Windows*)
There's a good chance that your computer will not recognize the loom over USB/serial because Windows 11 is too newfangled. Instead of a proper COM port, you'll see something like this in the Device Manager:

![screenshot of COM port error](https://github.com/sminliwu/AdaCAD-Jacq3G/assets/45988958/7d9c5638-1105-4960-b6f4-4669d8e2e4d0)

1. Uninstall the highlighted device in Device Manager and unplug the loom.
2. Download and install an older version of the serial driver. NOTE: besides the first link, I haven't downloaded and tested these links. Download and run executables responsibly.
  * [RECOMMENDED since it worked for me: v3.6.81 (09/04/2015)](https://drive.google.com/file/d/1x2dKDMaz8grEFTiyzvq-utA-RvkZwsB9/view) [(source)](https://embetronicx.com/uncategorized/fixed-prolific-pl2303ta-usb-to-serial-and-windows-11/)
  * [alternate link of the same version](https://www.usb-drivers.org/wp-content/uploads/2014/12/PL2303_Prolific_DriverInstaller_v1_12_0.zip) [(source)](https://www.usb-drivers.org/prolific-usb-to-serial-driver.html)
  * Alternative versions.
    * [v3.4.62.293 (10/17/2013)](https://drivers.softpedia.com/get/Other-DRIVERS-TOOLS/Others/Prolific-Technology-PL-2303-Driver.shtml#download)
    * [v3.8.25.0 (7/12/2018)](https://www.driverscloud.com/en/services/GetInformationDriver/72590-84992/delock-pl2303-prolific-driverinstaller-v1200zip)
   
Unsure what issues might happen with macOS. LMK.

## File Descriptions
* `main.js` -- The main attraction.
* `DBNode.js` -- Classes for holding onto nodes in a Firebase realtime database for real-time loom-AdaCAD connection.
* `firebaseDBPipe.js` -- Creates all of the required DB nodes to maintain loom status.
* `jacq3g.js` -- Handles sending/receiving data with the Jacq3 loom over USB/serial.
* `PC_relay.js` -- **[UNUSED]** Copied over from the TC2 control, adds the possibility of custom hardware controls for the loom.

## AdaCAD info
The `comms` branch of AdaCAD differs from the public and beta versions mainly in these files:
* a new `Sendpick` service -- `src/app/core/provider/sendpick`
* modified `Subdraft` component -- `src/app/mixer/palette/subdraft`
