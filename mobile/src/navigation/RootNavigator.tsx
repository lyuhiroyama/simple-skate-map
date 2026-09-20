import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AddSpotScreen } from '../screens/AddSpotScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { GroupMediaScreen } from '../screens/GroupMediaScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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
            options={({ route }) => ({ title: route.params.spotName })}
          />
          <Stack.Screen
            name="AddSpot"
            component={AddSpotScreen}
            options={{ title: 'Pin a place', presentation: 'modal' }}
          />
          <Stack.Screen
            name="GroupDetail"
            component={GroupDetailScreen}
            options={({ route }) => ({ title: route.params.groupName })}
          />
          <Stack.Screen
            name="GroupMedia"
            component={GroupMediaScreen}
            options={{ title: 'Media' }}
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
});
