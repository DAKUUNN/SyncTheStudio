import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { userHelpers, type UserModel } from "@/models/types";
import * as authService from "@/services/authService";
import { clearProjectKeyCache } from "@/services/keyManagementService";
import {
  startDeadlineWatcher,
  stopDeadlineWatcher,
} from "@/services/deadlineNotificationService";

/** Port of auth_provider.dart — login lockout, presence, profile + admin ops. */

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

interface AuthContextValue {
  currentUser: UserModel | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isVip: boolean;
  isFree: boolean;
  canAccessApp: boolean;
  remainingAttempts: number;
  login: (params: {
    email?: string;
    username?: string;
    password: string;
  }) => Promise<boolean>;
  register: (params: {
    email: string;
    password: string;
    username: string;
  }) => Promise<boolean>;
  loginWithApple: () => Promise<boolean>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  changePassword: (params: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<boolean>;
  updateOwnProfile: (params: {
    username?: string;
    email?: string;
    avatarUrl?: string;
    bio?: string;
  }) => Promise<boolean>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  updatePresence: (isOnline: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginAttempts = useRef<number[]>([]);
  const lockoutEndTime = useRef<number | null>(null);

  // Initial session restore, mirrors AuthProvider.initialize()
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (firebaseUser) {
          const user = await authService.getCurrentUser();
          setCurrentUser(user);
          if (user) {
            void authService.updateUserPresence(user.id, true);
            startDeadlineWatcher(user.id);
          }
        } else {
          setCurrentUser(null);
          stopDeadlineWatcher();
        }
        setIsLoading(false);
        setIsInitialized(true);
      },
      (err) => {
        // Without this, a failed initial auth check would leave the app
        // stuck on the splash screen forever instead of falling through to
        // the login screen.
        console.error("Auth initialization failed:", err);
        setIsLoading(false);
        setIsInitialized(true);
      }
    );
    return unsubscribe;
  }, []);

  // Presence on window focus/blur/close, mirrors app lifecycle handling
  useEffect(() => {
    if (!currentUser) return;
    const userId = currentUser.id;
    const onFocus = () => void authService.updateUserPresence(userId, true);
    const onBlur = () => void authService.updateUserPresence(userId, false);
    const onBeforeUnload = () => void authService.updateUserPresence(userId, false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [currentUser?.id]);

  const isLockedOut = useCallback((): boolean => {
    if (lockoutEndTime.current === null) return false;
    if (Date.now() > lockoutEndTime.current) {
      lockoutEndTime.current = null;
      loginAttempts.current = [];
      return false;
    }
    return true;
  }, []);

  const login = useCallback(
    async (params: { email?: string; username?: string; password: string }) => {
      if (isLockedOut()) {
        const remainingMin = Math.ceil(
          (lockoutEndTime.current! - Date.now()) / 60000
        );
        setError(`Zu viele Versuche. Bitte warte ${remainingMin} Minuten.`);
        return false;
      }

      setIsLoading(true);
      setError(null);

      loginAttempts.current.push(Date.now());
      const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
      loginAttempts.current = loginAttempts.current.filter((t) => t >= cutoff);

      if (loginAttempts.current.length >= MAX_LOGIN_ATTEMPTS) {
        lockoutEndTime.current = Date.now() + LOCKOUT_DURATION_MS;
        setError(
          `Zu viele fehlgeschlagene Versuche. Bitte warte ${
            LOCKOUT_DURATION_MS / 60000
          } Minuten.`
        );
        setIsLoading(false);
        return false;
      }

      try {
        const user = await authService.loginUser(params);
        setCurrentUser(user);
        loginAttempts.current = [];
        void authService.updateUserPresence(user.id, true);
        startDeadlineWatcher(user.id);
        setIsLoading(false);
        return true;
      } catch (e) {
        setError((e as Error).message.replace("Exception: ", ""));
        setIsLoading(false);
        return false;
      }
    },
    [isLockedOut]
  );

  const register = useCallback(
    async (params: { email: string; password: string; username: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await authService.createUser(params);
        if (result) {
          const user = await authService.getCurrentUser();
          setCurrentUser(user);
          if (user) {
            void authService.updateUserPresence(user.id, true);
            startDeadlineWatcher(user.id);
          }
        }
        setIsLoading(false);
        return result.length > 0;
      } catch (e) {
        setError((e as Error).message);
        setIsLoading(false);
        return false;
      }
    },
    []
  );

  const loginWithApple = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const nativeResult = await invoke<{
        identityToken: string;
        rawNonce: string;
        fullName: string | null;
      }>("plugin:apple-signin|sign_in");
      const user = await authService.loginWithApple({
        identityToken: nativeResult.identityToken,
        rawNonce: nativeResult.rawNonce,
        fullName: nativeResult.fullName,
      });
      setCurrentUser(user);
      void authService.updateUserPresence(user.id, true);
      startDeadlineWatcher(user.id);
      setIsLoading(false);
      return true;
    } catch (e) {
      const message = (e as Error).message ?? "";
      if (message !== "Abgebrochen") {
        setError(message.replace("Exception: ", ""));
      }
      setIsLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (currentUser) {
        await authService.updateUserPresence(currentUser.id, false);
      }
      stopDeadlineWatcher();
      clearProjectKeyCache();
      await authService.logoutUser();
    } finally {
      setCurrentUser(null);
      setIsLoading(false);
    }
  }, [currentUser]);

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    try {
      await authService.resetPassword(email);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, []);

  const changePassword = useCallback(
    async (params: { currentPassword: string; newPassword: string }) => {
      setError(null);
      try {
        await authService.changeUserPassword(params);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    []
  );

  const refreshUser = useCallback(async () => {
    const user = await authService.getCurrentUser();
    setCurrentUser(user);
  }, []);

  const updateOwnProfile = useCallback(
    async (params: {
      username?: string;
      email?: string;
      avatarUrl?: string;
      bio?: string;
    }) => {
      setError(null);
      try {
        await authService.updateOwnProfile(params);
        await refreshUser();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [refreshUser]
  );

  const updatePresence = useCallback(
    async (isOnline: boolean) => {
      if (!currentUser) return;
      await authService.updateUserPresence(currentUser.id, isOnline);
    },
    [currentUser]
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isLoading,
      isInitialized,
      error,
      isLoggedIn: currentUser !== null,
      isAdmin: currentUser ? userHelpers.isAdmin(currentUser) : false,
      isVip: currentUser ? userHelpers.isVip(currentUser) : false,
      isFree: currentUser ? userHelpers.isFree(currentUser) : true,
      canAccessApp: currentUser ? userHelpers.canAccessApp(currentUser) : false,
      remainingAttempts: MAX_LOGIN_ATTEMPTS - loginAttempts.current.length,
      login,
      register,
      loginWithApple,
      logout,
      resetPassword,
      changePassword,
      updateOwnProfile,
      refreshUser,
      clearError,
      updatePresence,
    }),
    [
      currentUser,
      isLoading,
      isInitialized,
      error,
      login,
      register,
      loginWithApple,
      logout,
      resetPassword,
      changePassword,
      updateOwnProfile,
      refreshUser,
      clearError,
      updatePresence,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
