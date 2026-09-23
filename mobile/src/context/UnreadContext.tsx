import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

interface UnreadContextValue {
  unreadGroupIds: Set<string>;
  hasAnyUnread: boolean;
  refreshUnread: () => Promise<void>;
  markGroupRead: (groupId: string) => void;
}

const UnreadContext = createContext<UnreadContextValue | undefined>(undefined);

const POLL_MS = 12_000;

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  const refreshUnread = useCallback(async () => {
    if (!session) {
      setIds([]);
      return;
    }
    try {
      const { groupIds } = await api.getUnread();
      setIds(groupIds);
    } catch {
      // Keep the last dots if the server is waking up.
    }
  }, [session]);

  const markGroupRead = useCallback((groupId: string) => {
    setIds((current) => current.filter((id) => id !== groupId));
    void api.markGroupRead(groupId).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session) {
      setIds([]);
      return;
    }
    void refreshUnread();
    const tick = setInterval(() => {
      void refreshUnread();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshUnread();
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [session, refreshUnread]);

  const value = useMemo<UnreadContextValue>(
    () => ({
      unreadGroupIds: new Set(ids),
      hasAnyUnread: ids.length > 0,
      refreshUnread,
      markGroupRead,
    }),
    [ids, refreshUnread, markGroupRead],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadContextValue {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error('useUnread must be used inside UnreadProvider');
  return ctx;
}
