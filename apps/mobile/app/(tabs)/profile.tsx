import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Platform,
} from 'react-native';

import { apiClient } from '../../lib/apiClient';
import * as healthSync from '../../lib/healthSync';
import type { AuthUser, RunnerProfile, ProfileUpdate, HealthSyncPayload, RouteSummary } from '../../lib/types';

// ---------------------------------------------------------------------------
// Image picker — graceful degradation if expo-image-picker is not installed
// ---------------------------------------------------------------------------
let launchImageLibraryAsync: ((opts: any) => Promise<any>) | null = null;
try {
  const mod = require('expo-image-picker');
  if (typeof mod?.launchImageLibraryAsync === 'function') {
    launchImageLibraryAsync = mod.launchImageLibraryAsync;
  }
} catch {
  // expo-image-picker not available
}

// ---------------------------------------------------------------------------
// Profile Screen
// ---------------------------------------------------------------------------
export default function ProfileScreen() {
  // Data state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [runner, setRunner] = useState<RunnerProfile | null>(null);
  const [healthData, setHealthData] = useState<HealthSyncPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formWallet, setFormWallet] = useState('');

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);

  // ── Data fetching ────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    try {
      const me = await apiClient.getMe();
      setUser(me);

      const [profile, myRoutes] = await Promise.all([
        me.username
          ? apiClient.getRunner(me.username).catch(() => null as RunnerProfile | null)
          : Promise.resolve(null as RunnerProfile | null),
        apiClient.getMyRoutes().catch(() => [] as RouteSummary[]),
      ]);

      setRunner(profile);
      setRoutes(myRoutes);
    } catch {
      // Network error — could serve cached data in the future
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      if (await healthSync.isAvailable()) {
        const data = await healthSync.readTodayData();
        setHealthData(data);
      }
    } catch {
      // Health data unavailable
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadProfile(), loadHealth()]);
  }, [loadProfile, loadHealth]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadAll();
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Edit form helpers ────────────────────────────────────────────────
  const openEditForm = () => {
    setFormUsername(user?.username ?? '');
    setFormEmail(user?.email ?? '');
    setFormBio(user?.bio ?? runner?.bio ?? '');
    setFormLocation(user?.location ?? '');
    setFormWallet(user?.preferred_reward_wallet ?? user?.wallet_address ?? '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const submitEdit = async () => {
    setSaving(true);
    try {
      const payload: ProfileUpdate = {};
      if (formUsername && formUsername !== user?.username) payload.username = formUsername;
      if (formEmail && formEmail !== (user?.email ?? '')) payload.email = formEmail;
      if (formBio !== (runner?.bio ?? '')) payload.bio = formBio;
      if (formLocation) payload.location = formLocation;
      if (formWallet && formWallet !== (user?.wallet_address ?? '')) payload.preferred_reward_wallet = formWallet;

      if (Object.keys(payload).length > 0) {
        const updated = await apiClient.updateProfile(payload);
        setUser(updated);
        // Refresh runner profile to get updated bio etc.
        if (updated.username) {
          try {
            const profile = await apiClient.getRunner(updated.username);
            setRunner(profile);
          } catch { /* ignore */ }
        }
      }
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  // ── Avatar picker ────────────────────────────────────────────────────
  const pickAvatar = async () => {
    if (!launchImageLibraryAsync) {
      Alert.alert('Unavailable', 'Image picker is not available on this device');
      return;
    }

    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingAvatar(true);

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: 'profile.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any);

      const { avatar_url } = await apiClient.uploadProfileImage(formData);
      setUser((prev) => prev ? { ...prev, avatar_url } : prev);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Could not upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Render: Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // ── Render: Edit form ────────────────────────────────────────────────
  if (editing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Edit Profile</Text>

        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput
          style={styles.input}
          value={formUsername}
          onChangeText={setFormUsername}
          placeholder="Username"
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={styles.input}
          value={formEmail}
          onChangeText={setFormEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Bio</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formBio}
          onChangeText={setFormBio}
          placeholder="Tell us about yourself"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          style={styles.input}
          value={formLocation}
          onChangeText={setFormLocation}
          placeholder="City, Country"
        />

        <Text style={styles.fieldLabel}>Preferred Reward Wallet</Text>
        <TextInput
          style={styles.input}
          value={formWallet}
          onChangeText={setFormWallet}
          placeholder="0x..."
          autoCapitalize="none"
        />

        <View style={styles.editActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabledBtn]}
            onPress={submitEdit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Render: Profile view ─────────────────────────────────────────────
  const avatarUrl = user?.avatar_url ?? runner?.avatarUrl ?? runner?.avatar_url;
  const displayName = runner?.username ?? user?.username ?? 'Runner';
  const bio = user?.bio ?? runner?.bio ?? null;
  const reputation = Math.round(runner?.reputationScore ?? runner?.reputation ?? user?.reputation_score ?? 0);
  const rank = runner?.rank ?? 0;
  const aura = runner?.aura ?? (runner?.auraLevel ? 1 : 0);
  const stepBalance = user?.step_balance ?? runner?.step_balance ?? 0;
  const friendpassSold = runner?.friendPass?.sold ?? runner?.friendpass_sold ?? 0;
  const friendpassMax = runner?.friendPass?.maxSupply ?? runner?.friendpass_max_supply ?? 0;
  const friendpassPrice = Number(runner?.friendPass?.currentPrice ?? runner?.friendpass_price ?? 0);
  const supporterCount = runner?.stats?.totalSupporters ?? runner?.supporter_count ?? 0;
  const totalTips = runner?.stats?.totalTips ?? '0.000000';
  const routeCount = routes.length || runner?.route_count || 0;
  const poiCount = runner?.poi_count || 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Avatar + Name */}
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              onError={() => setUser((prev) => prev ? { ...prev, avatar_url: null } : prev)}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {uploadingAvatar && (
            <ActivityIndicator
              size="small"
              color="#22c55e"
              style={styles.avatarSpinner}
            />
          )}
        </TouchableOpacity>
        <Text style={styles.displayName}>{displayName}</Text>
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}
      </View>

      {/* Edit button */}
      <TouchableOpacity style={styles.editBtn} onPress={openEditForm}>
        <Text style={styles.editBtnText}>Edit Profile</Text>
      </TouchableOpacity>

      {/* Stats grid */}
      <Text style={styles.sectionTitle}>Stats</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{reputation}</Text>
          <Text style={styles.statLabel}>Reputation</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>#{rank}</Text>
          <Text style={styles.statLabel}>Rank</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{routeCount}</Text>
          <Text style={styles.statLabel}>Trails</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{poiCount}</Text>
          <Text style={styles.statLabel}>POIs</Text>
        </View>
      </View>

      {/* FriendPass */}
      <Text style={styles.sectionTitle}>FriendPass</Text>
      <View style={styles.card}>
        <View style={styles.fpRow}>
          <Text style={styles.fpLabel}>Sold</Text>
          <Text style={styles.fpValue}>{friendpassSold} / {friendpassMax}</Text>
        </View>
        <View style={styles.fpRow}>
          <Text style={styles.fpLabel}>Current Price</Text>
          <Text style={styles.fpValue}>{friendpassPrice.toFixed(4)} ETH</Text>
        </View>
        <View style={styles.fpRow}>
          <Text style={styles.fpLabel}>Supporters</Text>
          <Text style={styles.fpValue}>{supporterCount}</Text>
        </View>
        <View style={styles.fpRow}>
          <Text style={styles.fpLabel}>Token Tips</Text>
          <Text style={styles.fpValue}>{totalTips} ETH</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Created Trails</Text>
      <View style={styles.card}>
        {routes.length === 0 ? (
          <Text style={styles.emptyText}>You have not created any saved routes yet.</Text>
        ) : (
          routes.slice(0, 4).map((route) => (
            <View key={route.id} style={styles.routeRow}>
              <Text style={styles.routeTitle}>{route.name}</Text>
              <Text style={styles.routeMeta}>
                {route.distance_km.toFixed(1)} km · {route.poi_count || 0} POIs · {route.is_minted ? 'Minted' : 'Draft'}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Health Metrics */}
      {healthData && (
        <>
          <Text style={styles.sectionTitle}>Health Metrics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{healthData.steps.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Steps</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {(healthData.distance_meters / 1000).toFixed(1)} km
              </Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{Math.round(healthData.calories_burned)}</Text>
              <Text style={styles.statLabel}>Calories</Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#d1fae5',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#15803d',
  },
  avatarSpinner: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  displayName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 10,
  },
  bio: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Edit button
  editBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  editBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803d',
    marginBottom: 8,
    marginTop: 4,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    minWidth: '47%',
    flex: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#15803d',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // FriendPass rows
  fpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  fpLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  fpValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  routeRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  routeMeta: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 12,
  },
  emptyText: {
    color: '#6b7280',
  },

  // Edit form
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
