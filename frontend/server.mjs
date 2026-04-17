// Run a production Next build over HTTPS with the self-signed certs that
// `next dev --experimental-https` generates into ./certificates/. Lets us
// reproduce issues in a prod build while keeping https://localhost (needed
// for Cartridge Controller + other secure-context APIs).
//
// Usage: `npm run start:dev` (runs `next build` then this script).

import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "localhost";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpsOptions = {
  key: readFileSync("./certificates/localhost-key.pem"),
  cert: readFileSync("./certificates/localhost.pem"),
};

createServer(httpsOptions, (req, res) => handle(req, res)).listen(port, () => {
  console.log(`> Ready on https://${hostname}:${port} (production build)`);
});
