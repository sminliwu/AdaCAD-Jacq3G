/**
 * Based on an Arduino board connected to the loom relay. Must have the Firmata (FirmataStandard.ino)
 * firmware uploaded to the board. Default relay is on pin 9.
 * 
 */

const { SerialPort } = require('serialport');
const { EventEmitter } = require('stream');
// const Firmata = require("firmata-io").Firmata;

class PCRelay extends EventEmitter {
    constructor(pin = 9, led = false) {
        super();
        const node = this;

        this.pin = pin;
        this.state = false;
        this.ledPins;

        if (led) {
            this.ledPins = [10, 13, 11]; // rgb led pins on Qduino mini
        }

        this.board;

        SerialPort.list().then(ports => {
            console.log(ports);
            // Figure which port to use...
            const port = ports[0]; // brute force just assume there's one port available
            port.baudRate = 57600; // from the Firmata firmware
        
            // Instantiate an instance of your Transport class
            const transport = new SerialPort(port);
        
            // Pass the new instance directly to the Firmata class
            node.board = new Firmata(transport);
        
            node.board.on("connect", () => {
                console.log("PC_relay.js: connected!", pin);
            });

            node.board.on("ready", () => {
                console.log("PC_relay.js: ready!");
                if (led) {
                    for (let p of node.ledPins) {
                        node.board.digitalWrite(p, node.board.LOW);
                    }
                }
                node.board.digitalWrite(this.pin, node.board.HIGH); // set relay to HIGH at start?
                this.state = true; 
                node.emit('ready');
            });
        });
    }

    toggle() {
        const board = this.board;
        this.state = !this.state;
        if (this.state) {
            board.digitalWrite(this.pin, board.HIGH);
        } else {
            board.digitalWrite(this.pin, board.LOW);
        }
        console.log("PC_relay.js: relay ", this.state);
    }
}

module.exports = {
    PCRelay
}

if (require.main === module) {
    const relay = new PCRelay(9);
    relay.on('ready', () => {
        relay.toggle();
        setTimeout(() => relay.toggle(), 1000);
    })
}
