import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { isDemo } from './src/config';
import { colors, spacing } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        {isDemo ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerText}>
              Demo mode — sample spots, no live account. Add Supabase keys in mobile/.env to go
              live.
            </Text>
          </View>
        ) : null}
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  demoBanner: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  demoBannerText: {
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
  },
});
