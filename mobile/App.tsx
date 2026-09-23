import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { UnreadProvider } from './src/context/UnreadContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { isDemo } from './src/config';
import { initPreview } from './src/lib/preview';
import { startApiKeepAlive } from './src/lib/api';
import { installErrorReporting, reportError } from './src/lib/errors';
import { colors, spacing } from './src/theme';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  componentDidCatch(error: Error) {
    reportError('render', error);
    this.setState({ failed: true });
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.boot}>
          <Text style={styles.crashTitle}>Something went wrong</Text>
          <Text style={styles.crashBody}>Close the app and open it again.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [ready, setReady] = useState(!isDemo);

  useEffect(() => {
    installErrorReporting();
    const stopKeepAlive = startApiKeepAlive();
    if (!isDemo) return stopKeepAlive;
    initPreview().finally(() => setReady(true));
    return stopKeepAlive;
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <UnreadProvider>
              <StatusBar style="light" />
              {isDemo ? (
                <View style={styles.demoBanner}>
                  <Text style={styles.demoBannerText}>
                    Sample places to look at — no live account.
                  </Text>
                </View>
              ) : null}
              <RootNavigator />
            </UnreadProvider>
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  boot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
  crashTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  crashBody: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
