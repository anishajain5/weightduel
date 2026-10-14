import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const app = buildApp();

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
