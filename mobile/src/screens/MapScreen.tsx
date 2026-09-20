import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type LongPressEvent } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import type { Group, SpotPin } from '../types';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

const DEFAULT_REGION = {
  // Downtown LA as a skate-friendly fallback until we get a GPS fix.
  latitude: 34.0407,
  longitude: -118.2468,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function MapScreen() {
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);
  const [spots, setSpots] = useState<SpotPin[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const centeredOnUser = useRef(false);

  const load = useCallback(async () => {
    try {
      const [spotsRes, groupsRes] = await Promise.all([api.getSpots(), api.getGroups()]);
      setSpots(spotsRes.spots);
      setGroups(groupsRes.groups);
    } catch (e) {
      Alert.alert('Could not load spots', e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || centeredOnUser.current) return;
      const position = await Location.getCurrentPositionAsync({});
      centeredOnUser.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        600,
      );
    })();
  }, []);

  const visibleSpots = activeGroupId
    ? spots.filter((s) => s.groupId === activeGroupId)
    : spots;

  const onLongPress = (event: LongPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    goToAddSpot(latitude, longitude);
  };

  const goToAddSpot = (latitude: number, longitude: number) => {
    if (groups.length === 0) {
      Alert.alert(
        'No group yet',
        'Create or join a group first (Groups tab) so your spots have somewhere to live.',
      );
      return;
    }
    navigation.navigate('AddSpot', { latitude, longitude });
  };

  const addAtMapCenter = async () => {
    const camera = await mapRef.current?.getCamera();
    if (camera) {
      goToAddSpot(camera.center.latitude, camera.center.longitude);
    }
  };

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        onLongPress={onLongPress}
        showsUserLocation
      >
        {visibleSpots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            title={spot.name}
            description={spot.address || undefined}
            pinColor={colors.primary}
            onCalloutPress={() =>
              navigation.navigate('SpotDetail', { spotId: spot.id, spotName: spot.name })
            }
          />
        ))}
      </MapView>

      {groups.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          <Chip
            label="All crews"
            active={activeGroupId === null}
            onPress={() => setActiveGroupId(null)}
          />
          {groups.map((g) => (
            <Chip
              key={g.id}
              label={g.name}
              active={activeGroupId === g.id}
              onPress={() => setActiveGroupId(g.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      <Pressable style={styles.fab} onPress={addAtMapCenter}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>
          {Platform.OS === 'web'
            ? 'Right-click the map (or tap +) to drop a spot'
            : 'Long-press the map to drop a spot'}
        </Text>
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  chips: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: spacing.md,
  },
  chipsContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    bottom: spacing.xl,
    height: 60,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    width: 60,
  },
  fabText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 36,
  },
  hint: {
    alignItems: 'center',
    bottom: spacing.md,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  hintText: {
    backgroundColor: 'rgba(15, 17, 21, 0.75)',
    borderRadius: radius.full,
    color: colors.textMuted,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
