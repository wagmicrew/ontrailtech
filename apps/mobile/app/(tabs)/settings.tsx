/**
 * Settings screen for the OnTrail Expo companion app.
 *
 * Provides:
 * - Logout button → authManager.logout() → navigate to login
 * - Health sync permissions toggle
 * - Push notification preferences toggle (register/unregister device token)
 * - App version info
 *
 * Requirements: 12.5, 6.5, 14.4, 14.5
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { authManager } from '../../lib/authManager';
import { apiClient } from '../../lib/apiClient';
import * as healthSync from '../../lib/healthSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read app version from expo config, falling back to app.json value. */
function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.1.0';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const router = useRouter();

  const [loggingOut, setLoggingOut] = useState(false);
  const [healthEnabled, setHealthEnabled] = useState(healthSync.hasPermissions());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [togglingPush, setTogglingPush] = useState(false);
  const [togglingHealth, setTogglingHealth] = useState(false);

  // Sync health toggle state on mount
  useEffect(() => {
    setHealthEnabled(healthSync.hasPermissions());
  }, []);

  // ------ Logout ------

  const handleLogout = useCallback(async () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await authManager.logout();
          } catch {
            // logout clears tokens regardless — safe to proceed
          } finally {
            setLoggingOut(false);
            router.replace('/(auth)/login');
          }
        },
      },
    ]);
  }, [router]);

  // ------ Health sync toggle ------

  const handleHealthToggle = useCallback(async (value: boolean) => {
    if (togglingHealth) return;
    setTogglingHealth(true);

    try {
      if (value) {
        const granted = await healthSync.requestPermissions();
        setHealthEnabled(granted);
        if (granted) {
          healthSync.startSync();
        } else {
          Alert.alert(
            'Permission denied',
            'Health data access was denied. You can enable it in your device Settings.',
          );
        }
      } else {
        healthSync.stopSync();
        setHealthEnabled(false);
      }
    } catch {
      Alert.alert('Error', 'Could not update health sync permissions.');
    } finally {
      setTogglingHealth(false);
    }
  }, [togglingHealth]);

  // ------ Push notification toggle ------

  const handlePushToggle = useCallback(async (value: boolean) => {
    if (togglingPush) return;
    setTogglingPush(true);

    try {
      if (value) {
        // Request permission and register token
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          Alert.alert(
            'Permission denied',
            'Push notification permission was denied. You can enable it in your device Settings.',
          );
          setPushEnabled(false);
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync();
        await apiClient.registerDeviceToken(tokenData.data);
        setPushEnabled(true);
      } else {
        // Unregister device token
        await apiClient.unregisterDeviceToken();
        setPushEnabled(false);
      }
    } catch {
      Alert.alert('Error', 'Could not update notification preferences.');
    } finally {
      setTogglingPush(false);
    }
  }, [togglingPush]);

  // ------ Render ------

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeader}>Preferences</Text>

      {/* Health sync toggle */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Health Sync</Text>
          <Text style={styles.rowSubtitle}>
            {healthSync.wasPermissionDenied()
              ? 'Permission denied — enable in device Settings'
              : 'Sync steps, distance & calories from Apple Health / Google Fit'}
          </Text>
        </View>
        <Switch
          value={healthEnabled}
          onValueChange={handleHealthToggle}
          disabled={togglingHealth}
          trackColor={{ false: '#d1d5db', true: '#86efac' }}
          thumbColor={healthEnabled ? '#22c55e' : '#f4f4f5'}
        />
      </View>

      {/* Push notifications toggle */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Push Notifications</Text>
          <Text style={styles.rowSubtitle}>
            Receive alerts for rank changes, token events & more
          </Text>
        </View>
        <Switch
          value={pushEnabled}
          onValueChange={handlePushToggle}
          disabled={togglingPush}
          trackColor={{ false: '#d1d5db', true: '#86efac' }}
          thumbColor={pushEnabled ? '#22c55e' : '#f4f4f5'}
        />
      </View>

      <Text style={styles.sectionHeader}>Account</Text>

      {/* Logout button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={loggingOut}
        activeOpacity={0.7}
      >
        {loggingOut ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.logoutText}>Log out</Text>
        )}
      </TouchableOpacity>

      {/* App version */}
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>OnTrail v{getAppVersion()}</Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  versionText: {
    fontSize: 13,
    color: '#9ca3af',
  },
});
