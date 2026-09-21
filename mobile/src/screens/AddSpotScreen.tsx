import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../lib/api';
import { uploadSpotAsset } from '../lib/upload';
import { Button, Field } from '../components/ui';
import type { Group } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

export function AddSpotScreen({ route, navigation }: RootStackScreenProps<'AddSpot'>) {
  const [coordinate, setCoordinate] = useState({
    latitude: route.params.latitude,
    longitude: route.params.longitude,
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState('Save spot');

  useEffect(() => {
    api
      .getGroups()
      .then(({ groups: g }) => {
        setGroups(g);
      })
      .catch(() => {
        setGroups([]);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await Location.reverseGeocodeAsync(coordinate);
        const place = results[0];
        if (!cancelled && place) {
          const parts = [
            [place.streetNumber, place.street].filter(Boolean).join(' '),
            place.city,
            place.region,
          ].filter(Boolean);
          setAddress(parts.join(', '));
        }
      } catch {
        // reverse geocoding is best-effort; the user can type the address
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coordinate]);

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (!result.canceled) {
      setAssets((prev) => [...prev, ...result.assets]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setAssets((prev) => [...prev, ...result.assets]);
    }
  };

  const removeAsset = (uri: string) => {
    setAssets((prev) => prev.filter((a) => a.uri !== uri));
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Hold up', 'Give the spot a name.');
      return;
    }

    setSaving(true);
    try {
      setSavingLabel('Creating spot...');
      const { spot } = await api.createSpot({
        groupIds,
        name: name.trim(),
        description: description.trim(),
        address: address.trim(),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });

      for (let i = 0; i < assets.length; i += 1) {
        setSavingLabel(`Uploading media ${i + 1}/${assets.length}...`);
        await uploadSpotAsset(spot.id, assets[i]);
      }

      navigation.goBack();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
      setSaving(false);
      setSavingLabel('Save spot');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            initialRegion={{
              ...coordinate,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={(e) => setCoordinate(e.nativeEvent.coordinate)}
          >
            <Marker
              coordinate={coordinate}
              draggable
              onDragEnd={(e) => setCoordinate(e.nativeEvent.coordinate)}
              pinColor={colors.primary}
            />
          </MapView>
          <Text style={styles.mapHint}>Tap or drag the pin to fine-tune the location</Text>
        </View>

        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. plaza ledges" />
        <Field
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Auto-filled from the pin, edit if needed"
        />
        <Field
          label="Notes"
          value={description}
          onChangeText={setDescription}
          placeholder="What you admire — materials, lines, clips you've seen..."
          multiline
          style={styles.multiline}
        />

        <Text style={styles.label}>Share with</Text>
        {groups.length === 0 ? (
          <Text style={styles.shareHint}>Just you. Share from the pin after you join a group.</Text>
        ) : (
          <>
            <Text style={styles.shareHint}>All is just you. Tap a group to share it there.</Text>
            <View style={styles.groupRow}>
            <Pressable
              onPress={() => setGroupIds([])}
              style={[styles.groupChip, groupIds.length === 0 ? styles.groupChipActive : null]}
            >
              <Text
                style={[
                  styles.groupChipText,
                  groupIds.length === 0 ? styles.groupChipTextActive : null,
                ]}
              >
                All
              </Text>
            </Pressable>
            {groups.map((g) => {
              const on = groupIds.includes(g.id);
              return (
                <Pressable
                  key={g.id}
                  onPress={() =>
                    setGroupIds((prev) =>
                      on ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                    )
                  }
                  style={[styles.groupChip, on ? styles.groupChipActive : null]}
                >
                  <Text style={[styles.groupChipText, on ? styles.groupChipTextActive : null]}>
                    {g.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          </>
        )}

        <Text style={styles.label}>Photos & videos</Text>
        <View style={styles.mediaRow}>
          {assets.map((asset) => (
            <Pressable key={asset.uri} onLongPress={() => removeAsset(asset.uri)}>
              <Image source={{ uri: asset.uri }} style={styles.thumb} />
              {asset.type === 'video' ? <Text style={styles.videoBadge}>VIDEO</Text> : null}
            </Pressable>
          ))}
        </View>
        {assets.length > 0 ? (
          <Text style={styles.mediaHint}>Long-press a thumbnail to remove it</Text>
        ) : null}
        <View style={styles.mediaButtons}>
          <View style={styles.mediaButton}>
            <Button title="Pick from library" variant="secondary" onPress={pickMedia} />
          </View>
          <View style={styles.mediaButton}>
            <Button title="Take photo" variant="secondary" onPress={takePhoto} />
          </View>
        </View>

        <Button title={savingLabel} onPress={save} loading={saving && assets.length === 0} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  mapWrap: {
    gap: spacing.xs,
  },
  map: {
    borderRadius: radius.md,
    height: 200,
    overflow: 'hidden',
  },
  mapHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  groupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  shareHint: {
    color: colors.textMuted,
    fontSize: 14,
  },
  groupChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  groupChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  groupChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  groupChipTextActive: {
    color: colors.onPrimary,
  },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: 84,
    width: 84,
  },
  videoBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    bottom: 4,
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    left: 4,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: 'absolute',
  },
  mediaHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mediaButton: {
    flex: 1,
  },
});
