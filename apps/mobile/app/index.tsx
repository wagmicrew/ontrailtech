import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>OnTrail</Text>
      <Text style={styles.subtitle}>Discover. Explore. Earn.</Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Start Exploring</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0fdf4' },
  title: { fontSize: 36, fontWeight: 'bold', color: '#15803d' },
  subtitle: { fontSize: 16, color: '#6b7280', marginTop: 8, marginBottom: 32 },
  button: { backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
