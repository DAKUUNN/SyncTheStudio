import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/stores/authStore";
import { ThemeProvider, useTheme } from "@/stores/themeStore";
import { ToastProvider } from "@/stores/toastStore";
import { I18nProvider, useI18n } from "@/i18n";
import { AppLayout } from "@/components/AppLayout";
import { ToastStack } from "@/components/ui";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { AppContextMenu } from "@/components/AppContextMenu";
import { LoginScreen } from "@/screens/LoginScreen";
import { RegisterScreen } from "@/screens/RegisterScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { ProjectListScreen } from "@/screens/ProjectListScreen";
import { ProjectFormScreen } from "@/screens/ProjectFormScreen";
import { ProjectDetailScreen } from "@/screens/projectDetail/ProjectDetailScreen";
import { CustomersScreen } from "@/screens/CustomersScreen";
import { InboxScreen } from "@/screens/InboxScreen";
import { SearchScreen } from "@/screens/SearchScreen";
import { NotificationsScreen } from "@/screens/NotificationsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { AdminScreen } from "@/screens/AdminScreen";
import { ExportScreen } from "@/screens/ExportScreen";
import { ActivityScreen } from "@/screens/ActivityScreen";
import { PublicMasterShareScreen } from "@/screens/public/PublicMasterShareScreen";
import { PublicCustomerUploadScreen } from "@/screens/public/PublicCustomerUploadScreen";

function SplashScreen() {
  const { t } = useI18n();
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(160deg, #0a0a0b, #131316 65%, #0a0a0b)",
        color: "#e2e8f0",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <img
          src="/logo.png"
          alt=""
          style={{
            width: 84,
            height: 84,
            borderRadius: 22,
            margin: "0 auto 20px",
            display: "block",
            objectFit: "cover",
            boxShadow: "0 18px 44px rgb(0 0 0 / 0.45)",
          }}
        />
        <h1 style={{ color: "#fff" }}>{t("app.name")}</h1>
        <div style={{ opacity: 0.65, marginTop: 4 }}>{t("app.tagline")}</div>
        <div className="spinner" style={{ margin: "26px auto 0", borderTopColor: "#fff" }} />
      </div>
    </div>
  );
}

function LockedNotice({ reason }: { reason: "inactive" | "locked" }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center" }}>
      <div className="card card-pad" style={{ maxWidth: 420, textAlign: "center" }}>
        <h2 style={{ marginBottom: 8 }}>
          {reason === "locked" ? t("account.lockedTitle") : t("account.inactiveTitle")}
        </h2>
        <p className="text-small text-muted" style={{ marginBottom: 16 }}>
          {reason === "locked" ? t("account.lockedMessage") : t("account.inactiveMessage")}
        </p>
        <button className="btn btn-secondary" onClick={() => void logout()}>
          {t("common.logout")}
        </button>
      </div>
    </div>
  );
}

function AuthGate() {
  const { currentUser, isInitialized, isLoading } = useAuth();
  const { syncWithUser } = useI18n();
  const { bindUser } = useTheme();

  useEffect(() => {
    if (currentUser) {
      syncWithUser(currentUser.id, currentUser.preferredLanguageCode);
      bindUser(currentUser.id);
    } else {
      bindUser(null);
    }
  }, [currentUser?.id]);

  if (!isInitialized || (isLoading && !currentUser)) {
    return <SplashScreen />;
  }

  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (currentUser.locked) return <LockedNotice reason="locked" />;
  if (!currentUser.isActive) return <LockedNotice reason="inactive" />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardScreen />} />
        <Route path="/projects" element={<ProjectListScreen />} />
        <Route path="/projects/new" element={<ProjectFormScreen />} />
        <Route path="/projects/:projectId" element={<ProjectDetailScreen />} />
        <Route path="/projects/:projectId/edit" element={<ProjectFormScreen />} />
        <Route path="/customers" element={<CustomersScreen />} />
        <Route path="/inbox" element={<InboxScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/export" element={<ExportScreen />} />
        <Route path="/activity" element={<ActivityScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

function RouterRoot() {
  const location = useLocation();

  if (location.pathname === "/master") {
    return <PublicMasterShareScreen />;
  }

  if (location.pathname === "/upload") {
    return <PublicCustomerUploadScreen />;
  }

  return <AuthGate />;
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <HashRouter>
              <RouterRoot />
            </HashRouter>
            <ToastStack />
            <UpdateNotifier />
            <WhatsNewModal />
            <AppContextMenu />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
