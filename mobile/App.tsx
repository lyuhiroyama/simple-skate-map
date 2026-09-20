import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { isDemo } from './src/config';
import { initPreview } from './src/lib/preview';
import { colors, spacing } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(!isDemo);

  useEffect(() => {
    if (!isDemo) return;
    initPreview().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        {isDemo ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerText}>
              Sample places to look at — no live account.
            </Text>
          </View>
        ) : null}
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  demoBanner: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  demoBannerText: {
    color: colors.onPrimary,
    fontSize: 12,
    textAlign: 'center',
  },
});
