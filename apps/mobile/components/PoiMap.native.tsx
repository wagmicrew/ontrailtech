import React from 'react';
import MapView, { Marker } from 'react-native-maps';

import type { POI } from '../lib/types';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type PoiMapProps = {
  mapRef: React.RefObject<any>;
  style: any;
  initialRegion: Region;
  onRegionChangeComplete: (region: Region) => void;
  pois: POI[];
  getRarityColor: (rarity: string) => string;
  onSelectPoi: (poi: POI) => void;
};

export default function PoiMap({
  mapRef,
  style,
  initialRegion,
  onRegionChangeComplete,
  pois,
  getRarityColor,
  onSelectPoi,
}: PoiMapProps) {
  return (
    <MapView
      ref={mapRef}
      style={style}
      initialRegion={initialRegion}
      onRegionChangeComplete={onRegionChangeComplete}
      showsUserLocation
      showsMyLocationButton
    >
      {pois.map((poi) => (
        <Marker
          key={poi.id}
          coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
          pinColor={getRarityColor(poi.rarity)}
          onPress={() => onSelectPoi(poi)}
        />
      ))}
    </MapView>
  );
}
