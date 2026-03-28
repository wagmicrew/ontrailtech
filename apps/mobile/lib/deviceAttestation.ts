/**
 * Device Attestation module for the OnTrail Expo companion app.
 *
 * Provides device integrity verification using platform-specific APIs:
 *   - iOS: Apple App Attest
 *   - Android: Google Play Integrity
 *
 * If attestation is unavailable or fails, returns `null` so the API client
 * can fall back to `X-Device-Attestation: none`. Requests are never blocked.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */
import { Platform } from 'react-native';

/**
 * Check whether device attestation is available on the current platform.
 *
 * Returns `true` on iOS (App Attest) or Android (Play Integrity) when the
 * corresponding native module is present. Returns `false` in Expo Go or
 * on unsupported platforms (web, etc.).
 */
export async function isAvailable(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      return await isAppAttestAvailable();
    }
    if (Platform.OS === 'android') {
      return await isPlayIntegrityAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Generate a device attestation token for the current platform.
 *
 * - iOS → Apple App Attest token
 * - Android → Google Play Integrity token
 *
 * Returns `null` when attestation is unavailable or any error occurs.
 * The caller (apiClient) attaches the result as `X-Device-Attestation`
 * header — either the token string or `"none"` when `null`.
 */
export async function getAttestationToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      return await getAppAttestToken();
    }
    if (Platform.OS === 'android') {
      return await getPlayIntegrityToken();
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// iOS — Apple App Attest
// ---------------------------------------------------------------------------

async function isAppAttestAvailable(): Promise<boolean> {
  try {
    const DCAppAttestService = requireNativeModule('DCAppAttestService');
    if (DCAppAttestService?.isSupported) {
      return await DCAppAttestService.isSupported();
    }
    return false;
  } catch {
    return false;
  }
}

async function getAppAttestToken(): Promise<string | null> {
  try {
    const DCAppAttestService = requireNativeModule('DCAppAttestService');
    if (!DCAppAttestService?.attestKey) return null;

    const keyId: string | null = await DCAppAttestService.generateKey();
    if (!keyId) return null;

    // Create a challenge hash (server would normally provide this)
    const challenge = generateClientChallenge();
    const attestation: string | null = await DCAppAttestService.attestKey(
      keyId,
      challenge,
    );
    return attestation ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Android — Google Play Integrity
// ---------------------------------------------------------------------------

async function isPlayIntegrityAvailable(): Promise<boolean> {
  try {
    const PlayIntegrity = requireNativeModule('PlayIntegrity');
    return PlayIntegrity != null;
  } catch {
    return false;
  }
}

async function getPlayIntegrityToken(): Promise<string | null> {
  try {
    const PlayIntegrity = requireNativeModule('PlayIntegrity');
    if (!PlayIntegrity?.requestIntegrityToken) return null;

    const challenge = generateClientChallenge();
    const token: string | null =
      await PlayIntegrity.requestIntegrityToken(challenge);
    return token ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to load a native module by name. Returns `null` if the module
 * is not linked (e.g. running inside Expo Go without a dev client).
 */
function requireNativeModule(name: string): any | null {
  try {
    const { NativeModules } = require('react-native');
    return NativeModules[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate a simple client-side challenge nonce. In production this should
 * come from the backend to prevent replay attacks, but for the initial
 * implementation a timestamp-based nonce provides basic uniqueness.
 */
function generateClientChallenge(): string {
  return `ontrail-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
