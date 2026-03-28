/**
 * Auth Manager for the OnTrail Expo companion app.
 *
 * Handles token storage (expo-secure-store), session validation,
 * and all auth flows: OTP, Google, Apple, wallet.
 */
import * as SecureStore from 'expo-secure-store';
import * as AppleAuthentication from 'expo-apple-authentication';

import { SECURE_STORE_KEYS } from './constants';
import {
  apiClient,
  setTokens,
  clearTokens,
  getRefreshToken,
} from './apiClient';
import type { TokenPair, AuthResponse, AuthUser } from './types';

// ---------------------------------------------------------------------------
// Token storage (SecureStore — AES-256 encrypted)
// ---------------------------------------------------------------------------

/**
 * Read the stored token pair from SecureStore.
 * Returns null if either token is missing.
 */
export async function getTokenPair(): Promise<TokenPair | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(
      SECURE_STORE_KEYS.ACCESS_TOKEN,
    );
    const refreshToken = await SecureStore.getItemAsync(
      SECURE_STORE_KEYS.REFRESH_TOKEN,
    );
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

/**
 * Persist a token pair to SecureStore.
 */
export async function storeTokenPair(tokens: TokenPair): Promise<void> {
  await setTokens(tokens.accessToken, tokens.refreshToken);
}

/**
 * Remove both tokens from SecureStore.
 */
export async function clearTokenPair(): Promise<void> {
  await clearTokens();
}

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

/**
 * Validate the current session on app launch.
 *
 * 1. Read stored token pair
 * 2. Call GET /users/me
 * 3. On 401 the apiClient automatically attempts a refresh + retry
 * 4. If everything fails, clear tokens and return null
 */
export async function validateSession(): Promise<AuthUser | null> {
  const pair = await getTokenPair();
  if (!pair) return null;

  try {
    const user = await apiClient.getMe();
    return user;
  } catch {
    // apiClient already attempted refresh on 401 — if we're here it failed
    await clearTokenPair();
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth flows
// ---------------------------------------------------------------------------

/**
 * Helper: extract tokens from an AuthResponse and persist them.
 */
async function handleAuthResponse(response: AuthResponse): Promise<void> {
  await storeTokenPair({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
  });
}

/**
 * OTP email login.
 *
 * 1. Request OTP for the given email
 * 2. Verify the OTP code
 * 3. Store the returned token pair
 */
export async function loginWithOtp(
  email: string,
  code: string,
): Promise<AuthResponse> {
  // Step 1: request OTP (the caller should have already done this for the UI,
  // but we call it here to satisfy the full flow contract)
  await apiClient.requestOtp(email);

  // Step 2: verify OTP
  const response = await apiClient.verifyOtp(email, code);

  // Step 3: store tokens
  await handleAuthResponse(response);

  return response;
}

/**
 * Convenience: request an OTP without verifying (for the UI's first step).
 */
export async function requestOtp(
  email: string,
): Promise<{ message: string; is_new_user: boolean }> {
  return apiClient.requestOtp(email);
}

// ---------------------------------------------------------------------------
// Google Sign-In
// ---------------------------------------------------------------------------

/**
 * Google OAuth login via expo-auth-session.
 *
 * Uses the Google discovery document to obtain an id_token,
 * then sends it to POST /auth/google.
 *
 * NOTE: This function must be called from a React component context
 * because expo-auth-session relies on hooks for the auth request.
 * For non-hook usage we provide a lower-level helper that accepts
 * the id_token directly.
 */
export async function loginWithGoogleToken(
  idToken: string,
): Promise<AuthResponse> {
  const response = await apiClient.authGoogle(idToken);
  await handleAuthResponse(response);
  return response;
}

/**
 * Full Google login flow.
 *
 * In a real Expo app this would be driven by the `useAuthRequest` hook
 * inside a React component. This imperative wrapper uses
 * `AuthSession.startAsync` as a fallback for non-hook contexts.
 *
 * The caller should prefer using the hook-based approach in the login
 * screen and call `loginWithGoogleToken` with the resulting id_token.
 */
export async function loginWithGoogle(): Promise<AuthResponse> {
  // expo-auth-session's Google provider needs to run inside a component
  // via hooks. We throw a descriptive error so callers know to use the
  // hook-based path or `loginWithGoogleToken` directly.
  throw new Error(
    'loginWithGoogle() must be driven by the useAuthRequest hook. ' +
      'Use loginWithGoogleToken(idToken) after obtaining the token from the hook.',
  );
}

// ---------------------------------------------------------------------------
// Apple Sign-In
// ---------------------------------------------------------------------------

/**
 * Apple Sign-In via expo-apple-authentication.
 *
 * Requests an identity token from Apple and sends it to POST /auth/apple.
 */
export async function loginWithApple(): Promise<AuthResponse> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const identityToken = credential.identityToken;
  if (!identityToken) {
    throw new Error('Apple Sign-In did not return an identity token');
  }

  const response = await apiClient.authApple(identityToken);
  await handleAuthResponse(response);
  return response;
}

// ---------------------------------------------------------------------------
// Wallet Login (ConnectKit / Family.co)
// ---------------------------------------------------------------------------

/**
 * Wallet login flow.
 *
 * Full flow: ConnectKit modal → get wallet address → POST /auth/challenge →
 * sign message → POST /auth/wallet → store tokens.
 *
 * ConnectKit React Native support is limited, so this is a stub that
 * accepts the wallet address and a signing function from the caller
 * (typically provided by the ConnectKit/wagmi context).
 */
export async function loginWithWallet(
  walletAddress?: string,
  signMessage?: (message: string) => Promise<string>,
): Promise<AuthResponse> {
  if (!walletAddress || !signMessage) {
    throw new Error(
      'loginWithWallet requires a connected wallet address and a signMessage function. ' +
        'Connect a wallet via ConnectKit first.',
    );
  }

  // Step 1: get challenge from backend
  const { message } = await apiClient.authChallenge(walletAddress);

  // Step 2: sign the challenge message with the connected wallet
  const signature = await signMessage(message);

  // Step 3: verify signature on backend
  const response = await apiClient.authWallet(walletAddress, signature, message);

  // Step 4: store tokens
  await handleAuthResponse(response);

  return response;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/**
 * Log out the current user.
 *
 * 1. Attempt POST /auth/logout with the refresh token
 * 2. Clear SecureStore **regardless** of whether the API call succeeds
 */
export async function logout(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await apiClient.authLogout(refreshToken);
    }
  } catch {
    // API call failed — that's fine, we still clear local tokens
  } finally {
    await clearTokenPair();
  }
}

// ---------------------------------------------------------------------------
// Convenience export as a single object
// ---------------------------------------------------------------------------

export const authManager = {
  getTokenPair,
  storeTokenPair,
  clearTokenPair,
  validateSession,
  requestOtp,
  loginWithOtp,
  loginWithGoogle,
  loginWithGoogleToken,
  loginWithApple,
  loginWithWallet,
  logout,
};
