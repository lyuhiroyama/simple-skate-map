import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { isConfigured } from './src/config';
import { colors, spacing } from './src/theme';

export default function App() {
  if (!isConfigured) {
    return (
      <View style={styles.configError}>
        <Text style={styles.configErrorTitle}>Almost there</Text>
        <Text style={styles.configErrorText}>
          Copy mobile/.env.example to mobile/.env, fill in your Supabase URL, anon key, and API
          URL, then restart the dev server.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  configError: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  configErrorTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  configErrorText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
