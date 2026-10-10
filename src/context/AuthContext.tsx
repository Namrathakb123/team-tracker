'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onIdTokenChanged, signInWithEmailAndPassword, signOut, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, browserLocalPersistence, setPersistence, type User,
} from 'firebase/auth';
import { describeLoginError, describePasswordChangeError } from '../utils/loginErrors';
import { emailProblem, isAccessRole, passwordProblem, type AccessRole } from '../utils/accounts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: AccessRole | null;
  isAdmin: boolean;
  // True when the login gives access to the app and the starting password has been replaced.
  isApproved: boolean;
  // True until the person replaces the starting password their admin gave them.
  mustChangePassword: boolean;
  // Message for someone signed in whose login doesn't give access to the app. Null when there is no problem.
  accessError: string | null;
  // Message to show on the sign-in screen when signing in did not work. Null when there is nothing to show.
  loginError: string | null;
  authToken: string | null;
  // True when the app runs on a private test copy of the data ("npm run dev:local").
  testData: boolean;
  // Returns a valid login token for API calls. Firebase refreshes it automatically once it expires (every hour).
  getToken: () => Promise<string | null>;
  // Signs in. Resolves to true when it worked (otherwise loginError says why).
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  // Replaces the starting password at the first sign-in. Resolves to a message saying what went wrong, or null.
  chooseFirstPassword: (password: string) => Promise<string | null>;
  // Changes the password later (needs the current one). Resolves to a message saying what went wrong, or null.
  changePassword: (current: string, next: string) => Promise<string | null>;
  // For when the server answered "Unauthorized": gets a fresh token, or signs out if the login is no longer valid
  // (for example an admin removed access or changed it).
  recheckSignIn: () => Promise<void>;
}

const NO_ACCESS = "Your login doesn't give you access to the Team Tracker. Ask an admin to check it on the Team page.";

// Set when the server says it is using a private test copy of the data ("npm run dev:local").
let usingTestData = false;

async function getFreshToken(): Promise<string | null> {
  if (!getApps().length) return null;
  const current = getAuth(getApp()).currentUser;
  return current ? current.getIdToken() : null;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Global lock to prevent React Strict Mode from initializing Firebase twice simultaneously
let isInitializing = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [testData, setTestData] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const initFirebase = async () => {
      if (!getApps().length && !isInitializing) {
        isInitializing = true;
        try {
          const res = await fetch('/api/config');
          const { testData: test, authEmulatorHost, ...config } = await res.json();
          usingTestData = !!test;
          if (!getApps().length) {
            initializeApp(config);
            // The test copy signs in against Firebase's emulator on this computer, never the real logins.
            if (authEmulatorHost) connectAuthEmulator(getAuth(getApp()), `http://${authEmulatorHost}`, { disableWarnings: true });
          }
        } catch (e) {
          console.error('Firebase config fetch failed', e);
          if (isMounted) setLoading(false);
          isInitializing = false;
          return;
        }
        isInitializing = false;
      }

      // Wait if it's currently initializing in the other Strict Mode thread
      while (isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!getApps().length) {
        if (isMounted) setLoading(false);
        return;
      }

      if (isMounted) setTestData(usingTestData);
      const auth = getAuth(getApp());
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) {
        console.warn('Could not set persistence', e);
      }

      // What the login may do travels inside its token ("custom claims", set by the server when an admin creates or
      // changes the login), so it is known straight away. The server checks it again on every request.
      let last = '';
      unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
        if (!isMounted) return;
        if (!firebaseUser) {
          last = '';
          setUser(null);
          setAuthToken(null);
          setRole(null);
          setMustChangePassword(false);
          setLoading(false);
          return;
        }
        try {
          const result = await firebaseUser.getIdTokenResult();
          if (!isMounted) return;
          const claimRole = isAccessRole(result.claims.role) ? result.claims.role : null;
          const mustChange = result.claims.mustChangePassword === true;
          // Tokens are renewed every hour; only a different person or different access changes what is shown.
          const key = `${firebaseUser.uid}|${claimRole}|${mustChange}`;
          setUser(firebaseUser);
          if (key !== last) {
            last = key;
            setAuthToken(result.token);
            setRole(claimRole);
            setMustChangePassword(mustChange);
          }
        } catch (e) {
          console.warn('Could not read the sign-in token', e);
          await signOut(auth).catch(() => {});
        }
        setLoading(false);
      });
    };

    initFirebase();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoginError(null);
    const problem = emailProblem(email) || (password ? null : 'Enter your password.');
    if (problem) {
      setLoginError(problem);
      return false;
    }
    try {
      await signInWithEmailAndPassword(getAuth(getApp()), email.trim(), password);
      return true;
    } catch (error: any) {
      console.warn('Login error', error?.code || error);
      setLoginError(describeLoginError(error?.code));
      return false;
    }
  };

  const logout = () => {
    setLoginError(null);
    if (getApps().length) signOut(getAuth(getApp()));
  };

  const chooseFirstPassword = async (password: string) => {
    const problem = passwordProblem(password);
    if (problem) return problem;
    const current = getApps().length ? getAuth(getApp()).currentUser : null;
    if (!current?.email) return 'You are not signed in any more. Sign in again with your starting password.';
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await current.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) return (await res.json().catch(() => null))?.error || `Your password could not be saved (error ${res.status}). Please try again.`;
      // Signing in again with the new password gives a token without the "must change password" mark.
      await signInWithEmailAndPassword(getAuth(getApp()), current.email, password);
      return null;
    } catch (error: any) {
      return describePasswordChangeError(error?.code);
    }
  };

  const changePassword = async (currentPassword: string, next: string) => {
    const problem = passwordProblem(next);
    if (problem) return problem;
    if (currentPassword === next) return 'Choose a password that is different from your current one.';
    const current = getApps().length ? getAuth(getApp()).currentUser : null;
    if (!current?.email) return 'You are not signed in any more. Sign in again.';
    try {
      // Firebase asks for the current password first, so nobody else at an open screen can change it.
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
      await updatePassword(current, next);
      return null;
    } catch (error: any) {
      return describePasswordChangeError(error?.code);
    }
  };

  const recheckSignIn = async () => {
    if (!getApps().length) return;
    const auth = getAuth(getApp());
    try {
      await auth.currentUser?.getIdToken(true);
    } catch {
      await signOut(auth).catch(() => {});
    }
  };

  const isApproved = !!user && !!role && !mustChangePassword;
  const accessError = user && !role ? NO_ACCESS : null;

  return (
    <AuthContext.Provider value={{
      user, loading, role, isAdmin: role === 'admin', isApproved, mustChangePassword, accessError, loginError, authToken, testData,
      getToken: getFreshToken, login, logout, chooseFirstPassword, changePassword, recheckSignIn,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
