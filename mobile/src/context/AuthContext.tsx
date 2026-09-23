import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { isDemo } from '../config';
import { explainError, reportError } from '../lib/errors';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithApple: () => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function previewSession(): Session {
  return {
    access_token: 'preview-token',
    refresh_token: 'preview-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: 'preview-user',
      app_metadata: {},
      user_metadata: { username: 'you' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  } as Session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signInWithApple = async () => {
    if (isDemo) {
      setSession(previewSession());
      return null;
    }
    if (Platform.OS !== 'ios') {
      return 'Sign in with Apple is available on iPhone.';
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        return 'Apple did not return a sign-in token.';
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) {
        reportError('apple-signin', error);
        return explainError(error, 'Apple sign-in didn’t work. Try again.');
      }

      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        const nameParts = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ].filter(Boolean);
        await supabase.auth.updateUser({
          data: {
            full_name: nameParts.join(' '),
            given_name: credential.fullName.givenName,
            family_name: credential.fullName.familyName,
          },
        });
      }
      return null;
    } catch (e) {
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
      if (code === 'ERR_REQUEST_CANCELED') return null;
      reportError('apple-signin', e);
      return explainError(e, 'Apple sign-in didn’t work. Try again.');
    }
  };

  const signInWithGoogle = async () => {
    if (isDemo) {
      setSession(previewSession());
      return null;
    }

    const redirectTo = makeRedirectUri({ scheme: 'mrclippedup' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      reportError('google-oauth', error);
      return explainError(error, 'Google sign-in didn’t work. Try again.');
    }
    if (!data.url) return 'Google sign-in didn’t work. Try again.';

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;

    const { params, errorCode } = QueryParams.getQueryParams(result.url);
    if (errorCode) {
      if (/access_denied|cancel/i.test(errorCode)) return null;
      reportError('google-oauth-code', errorCode);
      return 'Google sign-in didn’t work. Try again.';
    }
    const { access_token, refresh_token } = params;
    if (!access_token || !refresh_token) {
      return 'Google sign-in didn’t work. Try again.';
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError) {
      reportError('google-session', sessionError);
      return explainError(sessionError, 'Google sign-in didn’t work. Try again.');
    }
    return null;
  };

  const signOut = async () => {
    if (isDemo) {
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signInWithApple, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
