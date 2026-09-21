import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** The iPhone “click” when a long-press menu appears. */
export function hapticClick() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
}

export function hapticSelect() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}
