import L from 'leaflet';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Coordinate = { latitude: number; longitude: number };
type MapEvent = { nativeEvent: { coordinate: Coordinate } };

type MarkerProps = {
  coordinate: Coordinate;
  title?: string;
  description?: string;
  pinColor?: string;
  draggable?: boolean;
  onCalloutPress?: () => void;
  onDragEnd?: (event: MapEvent) => void;
};

type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  onLongPress?: (event: MapEvent) => void;
  onPress?: (event: MapEvent) => void;
  showsUserLocation?: boolean;
  children?: React.ReactNode;
};

function ensureLeafletCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

function zoomFromDelta(latitudeDelta?: number) {
  if (!latitudeDelta || latitudeDelta <= 0) return 13;
  return Math.max(3, Math.min(18, Math.round(Math.log2(360 / latitudeDelta))));
}

function pinIcon(color: string) {
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -18],
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
  });
}

export function Marker(_props: MarkerProps) {
  return null;
}

export const MapView = forwardRef(function MapView(
  { style, initialRegion, onLongPress, onPress, showsUserLocation, children }: MapViewProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onPressRef = useRef(onPress);
  const onLongPressRef = useRef(onLongPress);
  onPressRef.current = onPress;
  onLongPressRef.current = onLongPress;

  const markers = useMemo(() => {
    const collected: MarkerProps[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        collected.push(child.props as MarkerProps);
      }
    });
    return collected;
  }, [children]);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next: Region) => {
      mapRef.current?.setView(
        [next.latitude, next.longitude],
        zoomFromDelta(next.latitudeDelta),
        { animate: true },
      );
    },
    getCamera: async () => {
      const center = mapRef.current?.getCenter();
      return {
        center: {
          latitude: center?.lat ?? initialRegion?.latitude ?? 0,
          longitude: center?.lng ?? initialRegion?.longitude ?? 0,
        },
      };
    },
  }));

  useEffect(() => {
    ensureLeafletCss();
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(
      [initialRegion?.latitude ?? 0, initialRegion?.longitude ?? 0],
      zoomFromDelta(initialRegion?.latitudeDelta),
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPressRef.current?.({
        nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } },
      });
    });
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      onLongPressRef.current?.({
        nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } },
      });
    });

    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 250);
    setTimeout(() => map.invalidateSize(), 800);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Map is created once; region changes go through animateToRegion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    markers.forEach((marker) => {
      const pin = L.marker([marker.coordinate.latitude, marker.coordinate.longitude], {
        icon: pinIcon(marker.pinColor ?? '#f97316'),
        draggable: Boolean(marker.draggable),
        title: marker.title,
      });
      if (marker.title) {
        pin.bindPopup(
          `<strong>${marker.title}</strong>${marker.description ? `<br/>${marker.description}` : ''}<br/><em>Tap pin again to open</em>`,
        );
      }
      pin.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        marker.onCalloutPress?.();
      });
      pin.on('dragend', () => {
        const pos = pin.getLatLng();
        marker.onDragEnd?.({
          nativeEvent: { coordinate: { latitude: pos.lat, longitude: pos.lng } },
        });
      });
      pin.addTo(layer);
    });

    if (showsUserLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: '#38bdf8',
            fillOpacity: 1,
          }).addTo(layer);
        },
        () => undefined,
        { maximumAge: 60_000, timeout: 4000 },
      );
    }
  }, [markers, showsUserLocation]);

  const flat = StyleSheet.flatten(style) ?? {};
  const css: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: 200,
    position: (flat.position as React.CSSProperties['position']) ?? 'relative',
    top: flat.top as number | string | undefined,
    left: flat.left as number | string | undefined,
    right: flat.right as number | string | undefined,
    bottom: flat.bottom as number | string | undefined,
    borderRadius: flat.borderRadius as number | undefined,
    overflow: 'hidden',
    zIndex: 0,
  };

  return <div ref={containerRef} style={css} />;
});

export default MapView;
