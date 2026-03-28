/**
 * Push notification registration, handling, and deep-link routing
 * for the OnTrail Expo companion app.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';

import { apiClient } from './apiClient';
import { STORAGE_KEYS } from './constants';

// ---------------------------------------------------------------------------
// Deep-link screen mapping
// ---------------------------------------------------------------------------

/** Known screen values that can appear in a notification payload. */
type KnownScreen = 'profile' | 'explore' | 'home';

const SCREEN_ROUTES: Record<KnownScreen, string> = {
  profile: '/(tabs)/profile',
  explore: '/(tabs)/explore',
  home: '/(tabs)',
};

const DEFAULT_ROUTE = '/(tabs)';

/**
 * Map a notification payload `screen` field to an expo-router path.
 *
 * Unknown or missing values default to the home tab.
 */
export function getDeepLinkScreen(payload: Record<string, unknown> | undefined | null): string {
  if (!payload || typeof payload.screen !== 'string') {
    return DEFAULT_ROUTE;
  }
  const screen = payload.screen as string;
  return SCREEN_ROUTES[screen as KnownScreen] ?? DEFAULT_ROUTE;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Request push-notification permission, obtain the Expo push token,
 * register it with the backend, and persist it locally.
 *
 * Safe to call multiple times — skips registration when a token is
 * already stored and still valid.
 */
export async function registerForPushNotifications(): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    // Permission denied — nothing more we can do.
    return;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Register with backend
  await apiClient.registerDeviceToken(token);

  // Persist locally so we can unregister later
  await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, token);
}

// ---------------------------------------------------------------------------
// Unregistration
// ---------------------------------------------------------------------------

/**
 * Unregister the device token from the backend and clear the local copy.
 */
export async function unregisterPushNotifications(): Promise<void> {
  await apiClient.unregisterDeviceToken();
  await AsyncStorage.removeItem(STORAGE_KEYS.PUSH_TOKEN);
}

// ---------------------------------------------------------------------------
// Notification handlers
// ---------------------------------------------------------------------------

/**
 * Configure foreground notification presentation and notification-tap
 * deep-link routing.
 *
 * Call once from the root layout after the router is ready.
 *
 * @param router  The expo-router `router` object used for navigation.
 * @returns A cleanup function that removes the listeners.
 */
export function setupNotificationHandlers(router: Router): () => void {
  // Show an in-app banner when a notification arrives while foregrounded.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Handle notification taps → deep-link to the relevant screen.
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const payload = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const route = getDeepLinkScreen(payload);
      router.replace(route as any);
    },
  );

  return () => {
    subscription.remove();
  };
}
