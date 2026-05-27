import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Department = { id: string; code: string; name_ar: string };
type Profile = { id: string; full_name: string; department_id: string | null; phone: string | null };

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  department: Department | null;
  roles: string[];
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  canAccessDept: (code: string) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (uid: string) => {
    const [{ data: prof }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(prof as Profile | null);
    setRoles((rs ?? []).map((r: any) => r.role));

    if (prof?.department_id) {
      const { data: dep } = await supabase.from("departments").select("*").eq("id", prof.department_id).maybeSingle();
      setDepartment(dep as Department | null);
    } else {
      setDepartment(null);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        setProfile(null); setDepartment(null); setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) loadUserData(sess.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;

  const canAccessDept = (code: string) => {
    if (isManager) return true;
    return department?.code === code;
  };

  const value: AuthContextValue = {
    user, session, profile, department, roles, loading, isAdmin, isManager,
    canAccessDept,
    signOut: async () => { await supabase.auth.signOut(); },
    refresh: async () => { if (user) await loadUserData(user.id); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
