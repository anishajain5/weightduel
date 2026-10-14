import { z } from "zod";
import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MIN = 8;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(128, "Password is too long")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common");

export const displayNameSchema = z.string().trim().min(1, "Enter a name").max(50);

export const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

export const signupSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Accept the Terms and Privacy Policy" }) }),
  timezone: z.string().max(64).optional(),
  deviceLabel: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Do not apply strength rules at login: old passwords must still work.
  password: z.string().min(1).max(128),
  deviceLabel: z.string().max(100).optional(),
});

export const verifyEmailSchema = z.object({ code: codeSchema });
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export const logoutSchema = refreshSchema;
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
/** Step 1: {newEmail, password}. Step 2: {newEmail, code}. */
export const changeEmailSchema = z.union([
  z.object({ newEmail: emailSchema, password: z.string().min(1).max(128) }),
  z.object({ newEmail: emailSchema, code: codeSchema }),
]);

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
export interface ApiErrorBody {
  error: { code: string; message: string };
}
