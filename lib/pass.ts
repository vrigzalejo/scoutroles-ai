export const PASS_PRICE_CENTS = 2900;
export const PASS_DAYS = 30;
export const PASS_LETTER_QUOTA = 40;
export const PASS_COOKIE = "scoutroles_pass";

export const OAUTH_PROVIDERS = ["google", "microsoft", "apple", "github"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const SIGN_IN_PROVIDERS = ["google", "github"] as const satisfies readonly OAuthProvider[];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function signInEnabled(provider: OAuthProvider): boolean {
  return (SIGN_IN_PROVIDERS as readonly string[]).includes(provider);
}

export type PassStatus = {
  active: boolean;
  configured: boolean;
  gemini: boolean;
  id?: string;
  email?: string;
  provider?: OAuthProvider;
  expiresAt?: string;
  lettersUsed?: number;
  lettersLeft?: number;
  letterQuota?: number;
  hasPassword?: boolean;
};
