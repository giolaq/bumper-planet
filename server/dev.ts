import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { createServer } from 'vite';
import { createRelay } from './relay.ts';
const vite = await createServer({ server: { middlewareMode: true } });
const server = http.createServer((req, res) => {
  if (req.url === '/api/network') {
    const addresses = Object.values(networkInterfaces()).flat().filter(a => a?.family === 'IPv4' && !a.internal);
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ address: addresses[0]?.address })); return;
  }
  vite.middlewares(req, res);
});
createRelay(server);
const port = Number(process.env.PORT || 5173);
server.listen(port, '0.0.0.0', () => console.log(`Bumper Planet ready: http://localhost:${port}`));
