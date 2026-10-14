import type { FastifyInstance } from "fastify";
import { JOIN_CODE_RE, normalizeJoinCode } from "@wid/shared";
import type { AppDeps } from "../app";

/** Share-link landing page (`/join/ABC123`): hands off to the app, else offers the browser version. */
export async function joinPageRoutes(app: FastifyInstance, { env }: AppDeps) {
  app.get("/join/:code", async (req, reply) => {
    const code = normalizeJoinCode((req.params as { code: string }).code);
    const valid = JOIN_CODE_RE.test(code); // restricted alphabet, so safe to inline
    const deepLink = `${env.APP_SCHEME}://join?code=${code}`;
    const webLink = env.WEB_APP_URL ? `${env.WEB_APP_URL.replace(/\/$/, "")}/join?code=${code}` : null;
    const body = valid
      ? `<p>You've been invited to a Weigh-In Duel competition.</p>
         <p><a class="btn" href="${deepLink}">Open in the app</a></p>
         ${webLink ? `<p><a class="btn alt" href="${webLink}">Continue in your browser</a></p>` : ""}
         <p class="muted">Join code: <strong>${code}</strong>. You can also type it in under Race &rarr; Join.</p>
         <script>setTimeout(function(){location.href=${JSON.stringify(deepLink)}},300)</script>`
      : `<p>This invite link isn't valid. Ask your friend to share it again.</p>`;
    return reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
      .type("text/html; charset=utf-8")
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Join a competition</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center}.btn{display:inline-block;background:#111;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none}.alt{background:#fff;color:#111;border:1px solid #111}.muted{color:#666;font-size:14px}</style></head>
<body><h2>Weigh-In Duel</h2>${body}</body></html>`);
  });
}
