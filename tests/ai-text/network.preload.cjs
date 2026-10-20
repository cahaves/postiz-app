const forbid = (transport) => () => {
  throw new Error(`Unexpected outbound ${transport}`);
};
for (const name of ['http', 'https']) {
  const transport = require(name);
  transport.request = forbid(`${name}.request`);
  transport.get = forbid(`${name}.get`);
}
const net = require('net');
net.connect = forbid('net.connect');
net.createConnection = forbid('net.createConnection');
net.Socket.prototype.connect = forbid('socket.connect');
require('tls').connect = forbid('tls.connect');
globalThis.fetch = forbid('fetch');
