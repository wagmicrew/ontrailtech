import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { POI, RoutePoint } from '../lib/types';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type ConnectorLine = {
  id: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  color?: string;
};

type PoiMapProps = {
  mapRef?: React.RefObject<any>;
  style: any;
  initialRegion: Region;
  onRegionChangeComplete?: (region: Region) => void;
  pois?: POI[];
  getRarityColor?: (rarity: string) => string;
  onSelectPoi?: (poi: POI) => void;
  selectedPoiId?: string | null;
  routePoints?: RoutePoint[];
  editableRoute?: boolean;
  selectedRoutePointIndex?: number | null;
  connectorLines?: ConnectorLine[];
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onDragPoint?: (index: number, coordinate: { latitude: number; longitude: number }) => void;
  onSelectRoutePoint?: (index: number) => void;
  onDragPoi?: (poiId: string, coordinate: { latitude: number; longitude: number }) => void;
  onRouteLinePress?: (coordinate: { latitude: number; longitude: number }) => void;
};

export default function PoiMap({
  mapRef,
  style,
  initialRegion,
  onRegionChangeComplete,
  pois = [],
  getRarityColor = () => '#22c55e',
  onSelectPoi,
  selectedPoiId,
  routePoints = [],
  editableRoute = false,
  selectedRoutePointIndex = null,
  connectorLines = [],
  onMapPress,
  onDragPoint,
  onSelectRoutePoint,
  onDragPoi,
  onRouteLinePress,
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
          tappable={!!onRouteLinePress}
          onPress={(event) => onRouteLinePress?.(event.nativeEvent.coordinate)}
        />
      ) : null}

      {connectorLines.map((line) => (
        <Polyline
          key={line.id}
          coordinates={line.coordinates}
          strokeColor={line.color || '#f59e0b'}
          strokeWidth={3}
          lineDashPattern={[5, 6]}
          tappable={!!onRouteLinePress}
          onPress={(event) => onRouteLinePress?.(event.nativeEvent.coordinate)}
        />
      ))}

      {routePoints.map((point, index) => (
        <Marker
          key={`route-point-${index}`}
          coordinate={{ latitude: point.latitude, longitude: point.longitude }}
          title={point.label || `Point ${index + 1}`}
          pinColor={selectedRoutePointIndex === index ? '#0ea5e9' : editableRoute ? '#0f172a' : '#10b981'}
          draggable={editableRoute}
          onPress={() => onSelectRoutePoint?.(index)}
          onDragEnd={(event) => onDragPoint?.(index, event.nativeEvent.coordinate)}
        />
      ))}

      {pois.map((poi) => (
        <Marker
          key={poi.id}
          coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
          title={poi.name}
          description={poi.description || undefined}
          pinColor={selectedPoiId === poi.id ? '#0ea5e9' : poi.kind === 'detour' || poi.local_only ? '#f59e0b' : getRarityColor(poi.rarity)}
          draggable={selectedPoiId === poi.id && !!onDragPoi}
          onPress={() => onSelectPoi?.(poi)}
          onDragEnd={(event) => onDragPoi?.(poi.id, event.nativeEvent.coordinate)}
        />
      ))}
    </MapView>
  );
}
