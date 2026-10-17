import { app } from "./app.js";
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Fontea disponible en http://${process.env.HOST || "127.0.0.1"}:${port}`,
  ),
);

// Bound slow uploads and idle connections independently of the engine timeout.
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.setTimeout(65_000, (socket) => socket.destroy());
