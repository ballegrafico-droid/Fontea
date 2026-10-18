import { app } from "./app.js";
const configuredPort = process.env.PORT ?? "3001";
if (
  !/^\d+$/.test(configuredPort) ||
  Number(configuredPort) < 1 ||
  Number(configuredPort) > 65535
) {
  console.error("PORT debe ser un número entero entre 1 y 65535.");
  process.exit(1);
}
const port = Number(configuredPort);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () =>
  console.log(`Fontea disponible en http://${host}:${port}`),
);
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `El puerto ${port} ya está ocupado. Elige otro PORT en .env y actualiza proxy_pass en la configuración de Nginx de Fontea.`
      : `No se puede iniciar Fontea (${error.code || "error"}): ${error.message}`,
  );
  process.exit(1);
});
// Bound slow uploads and idle connections independently of the engine timeout.
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.setTimeout(65_000, (socket) => socket.destroy());
