import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Login from "../pages/Login";

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  return useContext(SessionContext);
}

// 로그인 게이트: 세션이 없으면 로그인 화면, 있으면 children 렌더.
export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="center muted">불러오는 중…</div>;
  }
  if (!session) {
    return <Login />;
  }
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
