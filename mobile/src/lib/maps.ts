import { Alert, Linking } from 'react-native';

/** Drop a pin at the exact coordinates. Do not search by address — Google snaps that to a nearby place. */
export function googleMapsPinUrl(latitude: number, longitude: number, name?: string) {
  const lat = latitude.toFixed(6);
  const lng = longitude.toFixed(6);
  const label = name?.trim();
  const q = label ? `${lat},${lng}+(${encodeURIComponent(label)})` : `${lat},${lng}`;
  return `https://www.google.com/maps?q=${q}&ll=${lat},${lng}&z=18`;
}

export async function openInGoogleMaps(opts: {
  latitude: number;
  longitude: number;
  name?: string;
}) {
  const url = googleMapsPinUrl(opts.latitude, opts.longitude, opts.name);
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open Maps', 'Google Maps did not open. Try again.');
  }
}
