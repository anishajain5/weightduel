import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

/** Web fallback for reset links (FR-AUTH-5): tries the app deep link, else explains. */
export async function resetPageRoutes(app: FastifyInstance, { env }: AppDeps) {
  app.get("/reset", async (req, reply) => {
    const token = (req.query as { token?: string }).token ?? "";
    const valid = TOKEN_RE.test(token); // restricts to URL-safe chars, so safe to inline
    const deepLink = `${env.APP_SCHEME}://reset?token=${token}`;
    const webLink = env.WEB_APP_URL ? `${env.WEB_APP_URL.replace(/\/$/, "")}/reset?token=${token}` : null;
    const body = valid
      ? `<p>Opening Weigh-In Duel&hellip;</p>
         <p><a class="btn" href="${deepLink}">Open the app to reset your password</a></p>
         ${webLink ? `<p><a class="btn alt" href="${webLink}">Continue in your browser</a></p>` : ""}
         <p class="muted">Nothing happened? Make sure the app is installed on this phone, then tap the button again. The link works once and expires 30 minutes after it was requested.</p>
         <script>setTimeout(function(){location.href=${JSON.stringify(deepLink)}},300)</script>`
      : `<p>This reset link isn't valid. Request a new one from the app's <strong>Forgot password?</strong> screen.</p>`;
    return reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
      .type("text/html; charset=utf-8")
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset password</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center}.btn{display:inline-block;background:#111;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none}.alt{background:#fff;color:#111;border:1px solid #111}.muted{color:#666;font-size:14px}</style></head>
<body><h2>Weigh-In Duel</h2>${body}</body></html>`);
  });
}
