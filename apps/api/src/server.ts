import { buildApp } from "./app";
import { createDb } from "./db";
import { loadEnv } from "./env";

const env = loadEnv();
const app = buildApp({ db: createDb(), env });

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
