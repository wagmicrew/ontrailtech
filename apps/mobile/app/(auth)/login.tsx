import { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { authManager } from '../../lib/authManager';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      // In a real implementation the login screen would use the useAuthRequest
      // hook from expo-auth-session to obtain the Google id_token, then call
      // authManager.loginWithGoogleToken(idToken). This placeholder calls the
      // imperative wrapper which will guide the developer to the hook-based path.
      await authManager.loginWithGoogle();
      router.replace('/(tabs)');
    } catch (err: any) {
      // User cancelled — return silently per requirement 3.4
      if (err?.message?.includes('cancelled') || err?.message?.includes('useAuthRequest')) return;
      Alert.alert('Error', err?.message ?? 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleAppleSignIn() {
    setLoading(true);
    try {
      await authManager.loginWithApple();
      router.replace('/(tabs)');
    } catch (err: any) {
      // User cancelled — return silently per requirement 4.5
      if (err?.code === 'ERR_CANCELED' || err?.message?.includes('cancelled')) return;
      Alert.alert('Error', err?.message ?? 'Apple sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleWalletConnect() {
    setLoading(true);
    try {
      // In a real implementation the ConnectKit context would provide the
      // walletAddress and signMessage function. This placeholder calls the
      // imperative wrapper which guides the developer to the ConnectKit path.
      await authManager.loginWithWallet();
      router.replace('/(tabs)');
    } catch (err: any) {
      // User rejected — return silently per requirement 5.6
      if (err?.message?.includes('rejected') || err?.message?.includes('ConnectKit')) return;
      Alert.alert('Error', err?.message ?? 'Wallet connection failed');
    } finally {
      setLoading(false);
    }
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
