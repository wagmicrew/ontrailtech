import { useEffect, useState } from 'react';
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

WebBrowser.maybeCompleteAuthSession();

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const FALLBACK_GOOGLE_CLIENT_ID = '1068426470875-inhfosoi2ut7e0up9qv1jrue66dm606e.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID = env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || FALLBACK_GOOGLE_CLIENT_ID;

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    expoClientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || GOOGLE_CLIENT_ID,
    androidClientId: env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
    responseType: 'id_token',
  });

  useEffect(() => {
    if (!googleResponse) return;

    if (googleResponse.type === 'success') {
      const idToken = googleResponse.authentication?.idToken || googleResponse.params?.id_token;
      if (!idToken) {
        setLoading(false);
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
          setLoading(false);
        }
      })();
      return;
    }

    setLoading(false);
  }, [googleResponse, router]);

  async function handleSendOtp() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await authManager.requestOtp(email.trim());
      setOtpSent(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode.trim()) return;
    setLoading(true);
    try {
      await authManager.loginWithOtp(email.trim(), otpCode.trim());
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!googleRequest) {
      Alert.alert('Google Sign-In', 'Google Sign-In is still loading. Please try again in a moment.');
      return;
    }

    setLoading(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type !== 'success') {
        setLoading(false);
      }
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes('cancelled')) return;
      Alert.alert('Error', err?.message ?? 'Google sign-in failed');
    }
  }

  async function handleAppleSignIn() {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      Alert.alert('Apple Sign-In', 'Apple Sign-In is only available on a supported iPhone or iPad.');
      return;
    }

    setLoading(true);
    try {
      await authManager.loginWithApple();
      router.replace('/(tabs)');
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.message?.includes('cancelled')) return;
      Alert.alert('Error', err?.message ?? 'Apple sign-in failed');
    } finally {
      setLoading(false);
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
          editable={!loading}
        />

        {!otpSent ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnTextLight}>Send OTP</Text>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="6-digit OTP code"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnTextLight}>Verify OTP</Text>
              )}
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
          disabled={loading}
        >
          <Text style={styles.btnTextDark}>Sign in with Google</Text>
        </TouchableOpacity>

        {/* ── Apple Sign-In (iOS only) ───────────────────── */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.btn, styles.btnApple]}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Text style={styles.btnTextLight}>Sign in with Apple</Text>
          </TouchableOpacity>
        )}

        {/* ── Wallet Connect ─────────────────────────────── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={handleWalletConnect}
          disabled={loading}
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
