import { invoke } from "@tauri-apps/api/core";

export interface AppleSignInResult {
  identityToken: string;
  rawNonce: string;
  userIdentifier: string;
  email: string | null;
  fullName: string | null;
}

/** Triggers the native "Sign in with Apple" sheet (Face ID / Touch ID).
 *  Resolves once the user completes or cancels; rejects on cancel/error. */
export async function signIn(): Promise<AppleSignInResult> {
  return await invoke<AppleSignInResult>("plugin:apple-signin|sign_in");
}
