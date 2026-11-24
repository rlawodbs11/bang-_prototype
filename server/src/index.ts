import { createGameServer } from './server.js';

const port = Number(process.env.PORT ?? 3001);

createGameServer(port)
  .then(({ port: boundPort }) => {
    console.log(`BANG! server listening on http://localhost:${boundPort}`);
  })
  .catch((err) => {
    console.error('Failed to start BANG! server:', err);
    process.exit(1);
  });
