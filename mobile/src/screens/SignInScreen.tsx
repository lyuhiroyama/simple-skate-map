import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Field } from '../components/ui';
import { colors, spacing } from '../theme';

export function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Hold up', 'Email and password are required.');
      return;
    }
    if (mode === 'signUp' && username.trim().length < 2) {
      Alert.alert('Hold up', 'Pick a username (at least 2 characters).');
      return;
    }

    setBusy(true);
    const error =
      mode === 'signIn'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, username.trim());
    setBusy(false);

    if (error) {
      Alert.alert('Something went wrong', error);
    } else if (mode === 'signUp') {
      Alert.alert(
        'Check your email',
        'If email confirmation is enabled, confirm your address before signing in.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>SKATE SPOTS</Text>
        <Text style={styles.tagline}>Find it. Skate it. Share it.</Text>

        {mode === 'signUp' ? (
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="e.g. kickflipkid"
          />
        ) : null}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="********"
        />

        <Button
          title={mode === 'signIn' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={busy}
        />

        <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          <Text style={styles.switchText}>
            {mode === 'signIn' ? "New here? Create an account" : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logo: {
    color: colors.primary,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 15,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  switchText: {
    color: colors.textMuted,
    fontSize: 14,
    padding: spacing.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
