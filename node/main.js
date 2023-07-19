

const loom = new Loom();
const dbcon = new DBPipe(loom);

dbcon.keepAlive();