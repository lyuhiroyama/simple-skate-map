import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, type LongPressEvent, type Region } from 'react-native-maps';
import { api } from '../lib/api';
import type { Group, SpotPin } from '../types';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

const USER_ZOOM = {
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function regionFrom(position: Location.LocationObject): Region {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    ...USER_ZOOM,
  };
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

async function getUserPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { status } as const;
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { status, position } as const;
  } catch {
    const position = await Location.getLastKnownPositionAsync();
    return { status, position } as const;
  }
}

export function MapScreen() {
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);
  const [spots, setSpots] = useState<SpotPin[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingPins, setLoadingPins] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [locationBlocked, setLocationBlocked] = useState(false);
  const centeredOnUser = useRef(false);

  const animateToUser = (position: Location.LocationObject) => {
    mapRef.current?.animateToRegion(regionFrom(position), 450);
  };

  const applyUserPosition = (position: Location.LocationObject) => {
    if (!centeredOnUser.current) {
      centeredOnUser.current = true;
      setInitialRegion(regionFrom(position));
      return;
    }
    animateToUser(position);
  };

  const focusOnUser = async () => {
    if (locating) return;
    setLocating(true);
    setLocationBlocked(false);
    try {
      const result = await getUserPosition();
      if (result.status !== 'granted') {
        setLocationBlocked(true);
        Alert.alert('Location needed', 'Allow location so the map can open where you are.');
        return;
      }
      if (!result.position) {
        setLocationBlocked(true);
        Alert.alert('No GPS yet', 'Could not find your position. Try again in a moment.');
        return;
      }
      applyUserPosition(result.position);
    } catch {
      setLocationBlocked(true);
      Alert.alert('No GPS yet', 'Could not find your position. Try again in a moment.');
    } finally {
      setLocating(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [spotsRes, groupsRes] = await Promise.all([api.getSpots(), api.getGroups()]);
      setSpots(spotsRes.spots);
      setGroups(groupsRes.groups);
    } catch (e) {
      Alert.alert('Could not load spots', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingPins(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setLocationBlocked(true);
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync();
      if (cancelled) return;
      if (lastKnown && !centeredOnUser.current) {
        centeredOnUser.current = true;
        setInitialRegion(regionFrom(lastKnown));
      }

      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled || !position) return;
        if (!centeredOnUser.current) {
          centeredOnUser.current = true;
          setInitialRegion(regionFrom(position));
        } else {
          animateToUser(position);
        }
      } catch {
        if (!centeredOnUser.current) setLocationBlocked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSpots = activeGroupId
    ? spots.filter((s) => s.groupIds.includes(activeGroupId))
    : spots;

  const onLongPress = (event: LongPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    goToAddSpot(latitude, longitude);
  };

  const goToAddSpot = (latitude: number, longitude: number) => {
    navigation.navigate('AddSpot', { latitude, longitude });
  };

  if (!initialRegion) {
    return (
      <View style={styles.center}>
        {locationBlocked ? (
          <>
            <Text style={styles.blockedTitle}>Location needed</Text>
            <Text style={styles.blockedBody}>The map opens on where you are. Allow location, then try again.</Text>
            <Pressable
              style={styles.retry}
              onPress={() => {
                centeredOnUser.current = false;
                void focusOnUser();
              }}
            >
              <Text style={styles.retryText}>Use my location</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} size="large" />
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
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

      {loadingPins ? (
        <View style={styles.chips} pointerEvents="none">
          <View style={styles.chipsContent}>
            <View style={styles.loadingChip}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.loadingChipText}>Loading spots</Text>
            </View>
          </View>
        </View>
      ) : groups.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          <Chip
            label="All"
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

      <View style={styles.fabStack}>
        <Pressable
          style={[styles.locate, locating ? styles.locateBusy : null]}
          onPress={focusOnUser}
          accessibilityLabel="My location"
        >
          <Ionicons name="navigate" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>
          {Platform.OS === 'web'
            ? 'Right-click the map to pin a spot'
            : 'Long-press the map to pin a spot'}
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
  center: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  blockedTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  blockedBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retry: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  chips: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: spacing.md,
  },
  chipsContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  loadingChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
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
    color: colors.onPrimary,
  },
  fabStack: {
    alignItems: 'center',
    bottom: spacing.xl,
    gap: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
  },
  locate: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    width: 48,
  },
  locateBusy: {
    opacity: 0.55,
  },
  hint: {
    alignItems: 'flex-end',
    bottom: spacing.md,
    left: spacing.md,
    paddingRight: 72,
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
