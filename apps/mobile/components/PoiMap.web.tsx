import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import type { RoutePoint } from '../lib/types';

export default function PoiMap({ style, routePoints = [] }: { style?: any; routePoints?: RoutePoint[] }) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.title}>Map preview</Text>
      <Text style={styles.subtitle}>
        Use iOS or Android for live map editing and draggable route points.
      </Text>
      <Text style={styles.counter}>{routePoints.length} route points ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d1fae5',
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#065f46',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#047857',
  },
  counter: {
    marginTop: 10,
    fontWeight: '700',
    color: '#0f172a',
  },
});
