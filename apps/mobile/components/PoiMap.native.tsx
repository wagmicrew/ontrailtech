import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { POI, RoutePoint } from '../lib/types';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type PoiMapProps = {
  mapRef?: React.RefObject<any>;
  style: any;
  initialRegion: Region;
  onRegionChangeComplete?: (region: Region) => void;
  pois?: POI[];
  getRarityColor?: (rarity: string) => string;
  onSelectPoi?: (poi: POI) => void;
  routePoints?: RoutePoint[];
  editableRoute?: boolean;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onDragPoint?: (index: number, coordinate: { latitude: number; longitude: number }) => void;
};

export default function PoiMap({
  mapRef,
  style,
  initialRegion,
  onRegionChangeComplete,
  pois = [],
  getRarityColor = () => '#22c55e',
  onSelectPoi,
  routePoints = [],
  editableRoute = false,
  onMapPress,
  onDragPoint,
}: PoiMapProps) {
  return (
    <MapView
      ref={mapRef}
      style={style}
      initialRegion={initialRegion}
      onRegionChangeComplete={onRegionChangeComplete}
      showsUserLocation
      showsMyLocationButton
      onPress={editableRoute ? (event) => onMapPress?.(event.nativeEvent.coordinate) : undefined}
    >
      {routePoints.length > 1 ? (
        <Polyline
          coordinates={routePoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }))}
          strokeColor="#10b981"
          strokeWidth={4}
        />
      ) : null}

      {routePoints.map((point, index) => (
        <Marker
          key={`route-point-${index}`}
          coordinate={{ latitude: point.latitude, longitude: point.longitude }}
          title={point.label || `Point ${index + 1}`}
          pinColor={editableRoute ? '#0f172a' : '#10b981'}
          draggable={editableRoute}
          onDragEnd={(event) => onDragPoint?.(index, event.nativeEvent.coordinate)}
        />
      ))}

      {pois.map((poi) => (
        <Marker
          key={poi.id}
          coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
          pinColor={getRarityColor(poi.rarity)}
          onPress={() => onSelectPoi?.(poi)}
        />
      ))}
    </MapView>
  );
}
