import { Alert, Linking } from 'react-native';

export function googleMapsSearchUrl(address: string) {
  const q = address.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export async function openAddressInGoogleMaps(address: string) {
  const url = googleMapsSearchUrl(address);
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open Maps', 'Google Maps did not open. Try again.');
  }
}
