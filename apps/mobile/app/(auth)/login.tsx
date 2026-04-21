import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authManager } from '../../lib/authManager';
import { apiClient } from '../../lib/apiClient';

WebBrowser.maybeCompleteAuthSession();

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

type BusyAction = 'otp-send' | 'otp-verify' | 'google' | 'apple' | null;

type GoogleClientConfig = {
  baseClientId: string;
  expoClientId: string;
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
};

function normalizeOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function buildInitialGoogleConfig(): GoogleClientConfig {
  return {
    baseClientId: env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
    expoClientId: env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
    webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
    iosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
    androidClientId: env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
  };
}

function OTPCodeInput({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (next: string) => void;
  editable: boolean;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={styles.otpWrapper}
      disabled={!editable}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChange(normalizeOtp(next))}
        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        importantForAutofill="yes"
        maxLength={6}
        editable={editable}
        style={styles.otpHiddenInput}
        selectionColor="#16a34a"
      />
      <View style={styles.otpBoxes}>
        {Array.from({ length: 6 }).map((_, index) => {
          const digit = value[index] ?? '';
          const active = editable && (index === value.length || (value.length === 6 && index === 5));
          return (
            <View
              key={index}
              style={[
                styles.otpBox,
                digit ? styles.otpBoxFilled : null,
                active ? styles.otpBoxActive : null,
              ]}
            >
              <Text style={styles.otpDigit}>{digit || ' '}</Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [googleConfig, setGoogleConfig] = useState<GoogleClientConfig>(buildInitialGoogleConfig);

  const googleEnabled = Boolean(
    googleConfig.baseClientId ||
    googleConfig.expoClientId ||
    googleConfig.webClientId ||
    googleConfig.iosClientId ||
    googleConfig.androidClientId,
  );
  const isLoading = busyAction !== null;

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    expoClientId: googleConfig.expoClientId || googleConfig.baseClientId || undefined,
    webClientId: googleConfig.webClientId || googleConfig.baseClientId || undefined,
    iosClientId: googleConfig.iosClientId || googleConfig.baseClientId || undefined,
    androidClientId: googleConfig.androidClientId || googleConfig.baseClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
    responseType: 'id_token',
  });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const settings = await apiClient.getPublicSettings();
        if (!active) return;
        setGoogleConfig((current) => ({
          baseClientId: settings.google_client_id || current.baseClientId,
          expoClientId: settings.google_expo_client_id || settings.google_client_id || current.expoClientId,
          webClientId: settings.google_web_client_id || settings.google_client_id || current.webClientId,
          iosClientId: settings.google_ios_client_id || settings.google_client_id || current.iosClientId,
          androidClientId: settings.google_android_client_id || settings.google_client_id || current.androidClientId,
        }));
      } catch {
        // Keep env-based config if public settings are not yet available.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (otpExpiresIn <= 0 && resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setOtpExpiresIn((current) => Math.max(0, current - 1));
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [otpExpiresIn, resendCooldown]);

  useEffect(() => {
    if (!googleResponse) return;

    if (googleResponse.type === 'success') {
      const idToken = googleResponse.authentication?.idToken || googleResponse.params?.id_token;
      if (!idToken) {
        setBusyAction(null);
        Alert.alert('Error', 'Google sign-in did not return an ID token');
        return;
      }

      void (async () => {
        try {
          await authManager.loginWithGoogleToken(idToken);
          router.replace('/(tabs)');
        } catch (err: any) {
          Alert.alert('Error', err?.message ?? 'Google sign-in failed');
        } finally {
          setBusyAction(null);
        }
      })();
      return;
    }

    setBusyAction(null);
  }, [googleResponse, router]);

  async function handleSendOtp() {
    if (!email.trim()) return;
    setBusyAction('otp-send');
    try {
      const response = await authManager.requestOtp(email.trim());
      setOtpSent(true);
      setOtpCode('');
      setOtpExpiresIn(response.expires_in_seconds ?? 900);
      setResendCooldown(Math.min(60, response.expires_in_seconds ?? 45));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to send OTP');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyOtp() {
    const normalizedOtp = normalizeOtp(otpCode);
    if (normalizedOtp.length !== 6) {
      Alert.alert('Invalid code', 'Enter the full 6-digit code before continuing.');
      return;
    }

    setBusyAction('otp-verify');
    try {
      await authManager.loginWithOtp(email.trim(), normalizedOtp);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'OTP verification failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGoogleSignIn() {
    if (!googleEnabled) {
      Alert.alert('Google Sign-In', 'Google Sign-In is not configured yet in site settings.');
      return;
    }

    if (!googleRequest) {
      Alert.alert('Google Sign-In', 'Google Sign-In is still loading. Please try again in a moment.');
      return;
    }

    setBusyAction('google');
    try {
      const result = await promptGoogleAsync();
      if (result.type !== 'success') {
        setBusyAction(null);
      }
    } catch (err: any) {
      setBusyAction(null);
      if (err?.message?.includes('cancelled')) return;
      Alert.alert('Error', err?.message ?? 'Google sign-in failed');
    }
  }

  async function handleAppleSignIn() {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      Alert.alert('Apple Sign-In', 'Apple Sign-In is only available on a supported iPhone or iPad.');
      return;
    }

    setBusyAction('apple');
    try {
      await authManager.loginWithApple();
      router.replace('/(tabs)');
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.message?.includes('cancelled')) return;
      Alert.alert('Error', err?.message ?? 'Apple sign-in failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWalletConnect() {
    const walletUrl = 'https://app.ontrail.tech';

    if (Platform.OS === 'web') {
      await Linking.openURL(walletUrl);
      return;
    }

    Alert.alert(
      'Connect Wallet',
      'Choose a wallet app or continue in your browser to sign in.',
      [
        {
          text: 'MetaMask',
          onPress: () => {
            void Linking.openURL('https://metamask.app.link/dapp/app.ontrail.tech');
          },
        },
        {
          text: 'Coinbase Wallet',
          onPress: () => {
            void Linking.openURL('https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Fapp.ontrail.tech');
          },
        },
        {
          text: 'Browser',
          onPress: () => {
            void Linking.openURL(walletUrl);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>OnTrail</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {/* ── OTP Email Flow ─────────────────────────────── */}
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#9ca3af"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />

        {!otpSent ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleSendOtp}
            disabled={isLoading}
          >
            {busyAction === 'otp-send' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnTextLight}>Send OTP</Text>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <Text style={styles.otpHint}>Enter the 6-digit code from your email.</Text>
            <OTPCodeInput value={otpCode} onChange={setOtpCode} editable={!isLoading} />
            <View style={styles.otpMetaRow}>
              <Text style={styles.otpMetaText}>
                {otpExpiresIn > 0 ? `Expires in ${formatCountdown(otpExpiresIn)}` : 'Code expired. Request a new one.'}
              </Text>
              <TouchableOpacity
                onPress={handleSendOtp}
                disabled={isLoading || resendCooldown > 0}
              >
                <Text style={[styles.otpResendText, (isLoading || resendCooldown > 0) ? styles.otpResendTextDisabled : null]}>
                  {resendCooldown > 0 ? `Resend in ${formatCountdown(resendCooldown)}` : 'Resend code'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleVerifyOtp}
              disabled={isLoading || normalizeOtp(otpCode).length !== 6}
            >
              {busyAction === 'otp-verify' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnTextLight}>Verify OTP</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setOtpSent(false); setOtpCode(''); setOtpExpiresIn(0); setResendCooldown(0); }}>
              <Text style={styles.changeEmailText}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Divider ────────────────────────────────────── */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── Google Sign-In ─────────────────────────────── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={handleGoogleSignIn}
          disabled={isLoading || !googleEnabled}
        >
          {busyAction === 'google' ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.btnTextDark}>Sign in with Google</Text>
          )}
        </TouchableOpacity>

        {/* ── Apple Sign-In (iOS only) ───────────────────── */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.btn, styles.btnApple]}
            onPress={handleAppleSignIn}
            disabled={isLoading}
          >
            {busyAction === 'apple' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnTextLight}>Sign in with Apple</Text>
            )}
          </TouchableOpacity>
        )}

        {/* ── Wallet Connect ─────────────────────────────── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={handleWalletConnect}
          disabled={isLoading}
        >
          <Text style={styles.btnTextDark}>Connect Wallet</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#15803d',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
  },
  otpHint: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 12,
  },
  otpWrapper: {
    marginBottom: 12,
  },
  otpHiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  otpBoxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpBox: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f7fee7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    backgroundColor: '#dcfce7',
    borderColor: '#4ade80',
  },
  otpBoxActive: {
    borderColor: '#16a34a',
    shadowColor: '#16a34a',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  otpMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  otpMetaText: {
    color: '#6b7280',
    fontSize: 13,
  },
  otpResendText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '600',
  },
  otpResendTextDisabled: {
    color: '#9ca3af',
  },
  changeEmailText: {
    color: '#15803d',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  btn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: '#22c55e',
  },
  btnOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  btnApple: {
    backgroundColor: '#000',
  },
  btnTextLight: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  btnTextDark: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1d5db',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#9ca3af',
    fontSize: 14,
  },
});
