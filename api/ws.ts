import http from 'node:http';
import { createRelay } from '../server/relay.js';
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'Bumper Planet relay', multiplayer: Boolean(process.env.REDIS_URL) }));
});
createRelay(server);
export default server;
