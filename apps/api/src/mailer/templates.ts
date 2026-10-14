import type { Mail } from "./index";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const wrap = (title: string, bodyHtml: string) =>
  `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">` +
  `<h2 style="margin:0 0 12px">${esc(title)}</h2>${bodyHtml}` +
  `<p style="color:#666;font-size:12px;margin-top:32px">Weigh-In Duel</p></div>`;

export const verifyEmailMail = (to: string, name: string, code: string): Mail => ({
  to,
  subject: "Your Weigh-In Duel verification code",
  text: `Hi ${name},\n\nYour verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't sign up, ignore this email.`,
  html: wrap("Verify your email", `<p>Hi ${esc(name)}, your code is:</p><p style="font-size:32px;letter-spacing:6px;font-weight:700">${code}</p><p>It expires in 15 minutes.</p>`),
});

export const resetPasswordMail = (to: string, link: string): Mail => ({
  to,
  subject: "Reset your Weigh-In Duel password",
  text: `Use this link to reset your password (valid for 30 minutes):\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
  html: wrap("Reset your password", `<p>This link is valid for 30 minutes.</p><p><a href="${esc(link)}">Reset password</a></p><p>If you didn't ask for this, ignore this email.</p>`),
});

export const passwordChangedMail = (to: string): Mail => ({
  to,
  subject: "Your Weigh-In Duel password was changed",
  text: "Your password was changed and you were signed out of all devices.\n\nNot you? Reply to this email or contact us right away.",
  html: wrap("Password changed", "<p>Your password was changed and you were signed out of all devices.</p><p><strong>Not you?</strong> Contact us right away.</p>"),
});

export const changeEmailCodeMail = (to: string, code: string): Mail => ({
  to,
  subject: "Confirm your new email for Weigh-In Duel",
  text: `Your code to confirm this email address is ${code}. It expires in 15 minutes.`,
  html: wrap("Confirm your new email", `<p style="font-size:32px;letter-spacing:6px;font-weight:700">${code}</p><p>It expires in 15 minutes.</p>`),
});

export const emailChangedMail = (to: string, newEmail: string): Mail => ({
  to,
  subject: "Your Weigh-In Duel email was changed",
  text: `The email on your account was changed to ${newEmail}.\n\nNot you? Contact us right away.`,
  html: wrap("Email changed", `<p>The email on your account was changed to ${esc(newEmail)}.</p><p><strong>Not you?</strong> Contact us right away.</p>`),
});
