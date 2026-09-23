import { Alert, AppState, Platform } from 'react-native';
import { config, isDemo } from '../config';
import { supabase } from './supabase';

const FALLBACK = 'Something went wrong. Try again.';
const TECHNICAL =
  /FunctionCallException|kCLErrorDomain|NS[A-Z]|ExpoModules|ConcurrentFunction|LocationUnavailable|LocationRequester|at \S+\.(swift|m|mm|ts|tsx|js):|<!DOCTYPE|<html|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|postgres|PGRST|JWT|stack|TypeError|ReferenceError|SyntaxError|undefined is not|null is not an object|Network request failed|Failed to fetch|Aborted|AbortError|SSL |cloudflare|status \d{3}|Request failed \(|uploadAsync|JSON Parse|Unexpected token|auth\/v1|supabase\.co/i;

function rawMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.trim();
  if (typeof error === 'string') return error.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string') return value.trim();
  }
  return '';
}

function rawName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'Error';
}

function rawStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 4000);
  return undefined;
}

export function isIgnorableError(error: unknown): boolean {
  const name = rawName(error);
  const message = rawMessage(error);
  const blob = `${name} ${message}`;
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  if (code === 'ERR_REQUEST_CANCELED' || name === 'AbortError') return true;
  if (/aborted|cancelled|canceled/i.test(blob)) return true;
  if (AppState.currentState !== 'active' && /network|fetch|unavailable|timeout|timed out/i.test(blob)) {
    return true;
  }
  return false;
}

function isSafeUserMessage(message: string): boolean {
  if (!message || message.length > 160) return false;
  if (TECHNICAL.test(message)) return false;
  return /language we don’t allow|not available|already|taken|invalid|username|invite|permission|sign in|once a day|block yourself|hold up|give the spot/i.test(
    message,
  );
}

function apiStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return 0;
}

export function explainError(error: unknown, fallback = FALLBACK): string {
  const message = rawMessage(error);
  const status = apiStatus(error);
  if (status === 401) return 'Sign in again to continue.';
  if (status >= 400 && status < 500 && message && message.length <= 160 && !TECHNICAL.test(message)) {
    return message;
  }
  if (isSafeUserMessage(message)) return message;
  if (/network|fetch|ssl|offline|internet|timed out|timeout/i.test(message)) {
    return 'Check your connection and try again.';
  }
  return fallback;
}

let lastSentAt = 0;
let sentThisMinute = 0;
let minuteStarted = 0;

export function reportError(action: string, error: unknown): void {
  if (isDemo) return;
  const now = Date.now();
  if (now - minuteStarted > 60_000) {
    minuteStarted = now;
    sentThisMinute = 0;
  }
  if (sentThisMinute >= 12) return;
  if (now - lastSentAt < 400) return;
  lastSentAt = now;
  sentThisMinute += 1;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch(`${config.apiUrl}/client-errors`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: action.slice(0, 80),
          name: rawName(error).slice(0, 120),
          message: rawMessage(error).slice(0, 2000) || 'Unknown error',
          stack: rawStack(error),
          appVersion: '0.1.0',
          platform: Platform.OS,
        }),
      });
    } catch {
      // Logging must never crash the app.
    }
  })();
}

export function alertError(title: string, error: unknown, fallback = FALLBACK): void {
  reportError(title, error);
  if (isIgnorableError(error)) return;
  Alert.alert(title, explainError(error, fallback));
}

export function installErrorReporting(): void {
  const g = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };
  const utils = g.ErrorUtils;
  if (utils?.setGlobalHandler) {
    const previous = utils.getGlobalHandler?.();
    utils.setGlobalHandler((error, isFatal) => {
      reportError(isFatal ? 'fatal' : 'uncaught', error);
      previous?.(error, isFatal);
    });
  }
}
