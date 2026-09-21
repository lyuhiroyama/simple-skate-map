import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AddSpotScreen } from '../screens/AddSpotScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { GroupMediaScreen } from '../screens/GroupMediaScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { MapScreen } from '../screens/MapScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SpotDetailScreen } from '../screens/SpotDetailScreen';
import type { RootStackParamList } from './types';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: '800' },
        headerTitleAlign: 'center',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingHorizontal: 48,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Spots',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

function PinSheetHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheetHeader, { paddingTop: Math.max(insets.top, 10) }]}>
      <View style={styles.sheetGrabber} accessibilityElementsHidden />
      <Text style={styles.sheetTitle}>Pin a place</Text>
    </View>
  );
}

function iosPlainBackItems(goBack: () => void) {
  return ({ canGoBack, tintColor }: { canGoBack?: boolean; tintColor?: string }) => {
    if (!canGoBack) return [];
    return [
      {
        type: 'button' as const,
        label: 'Back',
        icon: { type: 'sfSymbol' as const, name: 'chevron.backward' as const },
        onPress: goBack,
        hidesSharedBackground: true,
        accessibilityLabel: 'Back',
        tintColor: tintColor ?? colors.text,
      },
    ];
  };
}

export function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      {session ? (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '800' },
          }}
        >
          <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
          <Stack.Screen
            name="SpotDetail"
            component={SpotDetailScreen}
            options={({ route }) => ({
              title: route.params.spotName,
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="AddSpot"
            component={AddSpotScreen}
            options={{
              title: 'Pin a place',
              presentation: 'modal',
              header: () => <PinSheetHeader />,
            }}
          />
          <Stack.Screen
            name="GroupDetail"
            component={GroupDetailScreen}
            options={({ route, navigation }) => ({
              title: route.params.groupName,
              headerBackButtonDisplayMode: 'minimal',
              unstable_headerLeftItems: iosPlainBackItems(() => navigation.goBack()),
            })}
          />
          <Stack.Screen
            name="GroupMedia"
            component={GroupMediaScreen}
            options={({ navigation }) => ({
              title: 'Media',
              headerBackButtonDisplayMode: 'minimal',
              unstable_headerLeftItems: iosPlainBackItems(() => navigation.goBack()),
            })}
          />
          <Stack.Screen
            name="Legal"
            component={LegalScreen}
            options={{ title: 'Privacy & account' }}
          />
        </Stack.Navigator>
      ) : (
        <SignInScreen />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  sheetHeader: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
  },
  sheetGrabber: {
    backgroundColor: colors.textMuted,
    borderRadius: 3,
    height: 5,
    marginBottom: 10,
    opacity: 0.55,
    width: 36,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
});
