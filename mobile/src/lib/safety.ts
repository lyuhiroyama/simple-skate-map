import { ActionSheetIOS, Alert, InteractionManager, Platform } from 'react-native';

const REASONS = [
  { id: 'inappropriate', label: 'Inappropriate' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REASONS)[number]['id'];

/** iOS drops ActionSheets presented while a Modal is still dismissing. */
export function afterDismiss(fn: () => void) {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(fn, Platform.OS === 'ios' ? 400 : 0);
  });
}

export function showReportBlockSheet(opts: { onReport: (reason: ReportReason) => void; onBlock: () => void }) {
  const pick = (index: number) => {
    if (index === 1) afterDismiss(() => showReasonSheet(opts.onReport));
    if (index === 2) afterDismiss(() => opts.onBlock());
  };

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Report', 'Block'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 2,
      },
      pick,
    );
    return;
  }

  Alert.alert('Safety', undefined, [
    { text: 'Report', onPress: () => afterDismiss(() => showReasonSheet(opts.onReport)) },
    { text: 'Block', style: 'destructive', onPress: () => afterDismiss(() => opts.onBlock()) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function showReasonSheet(onReport: (reason: ReportReason) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Why are you reporting this?',
        options: ['Cancel', ...REASONS.map((r) => r.label)],
        cancelButtonIndex: 0,
      },
      (index) => {
        if (index > 0) onReport(REASONS[index - 1].id);
      },
    );
    return;
  }

  Alert.alert('Why are you reporting this?', undefined, [
    ...REASONS.map((reason) => ({
      text: reason.label,
      onPress: () => onReport(reason.id),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

export function confirmBlock(username: string, onConfirm: () => void) {
  Alert.alert(`Block ${username}?`, 'You will stop seeing their messages and spots.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Block', style: 'destructive', onPress: onConfirm },
  ]);
}

export function blockedNotice() {
  Alert.alert('Blocked', 'Unblock them in Groups → Privacy & account.');
}
