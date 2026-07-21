import { lazy, Suspense, useEffect } from "react";
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
import { RecoveryKeyModals } from "@/components/RecoveryKeyModals";
import { DawAutoTracker } from "@/components/DawAutoTracker";
import { PushNavigationHandler } from "@/components/PushNavigationHandler";

// Route-level code splitting: each screen becomes its own chunk fetched on
// first visit instead of all 20 screens loading eagerly in the main bundle
// on startup (desktop cold-start and the syncthestudio.de web build both
// pay that cost up front otherwise).
const LoginScreen = lazy(() => import("@/screens/LoginScreen").then((m) => ({ default: m.LoginScreen })));
const RegisterScreen = lazy(() => import("@/screens/RegisterScreen").then((m) => ({ default: m.RegisterScreen })));
const DashboardScreen = lazy(() => import("@/screens/DashboardScreen").then((m) => ({ default: m.DashboardScreen })));
const ProjectListScreen = lazy(() => import("@/screens/ProjectListScreen").then((m) => ({ default: m.ProjectListScreen })));
const ProjectFormScreen = lazy(() => import("@/screens/ProjectFormScreen").then((m) => ({ default: m.ProjectFormScreen })));
const ProjectDetailScreen = lazy(() =>
  import("@/screens/projectDetail/ProjectDetailScreen").then((m) => ({ default: m.ProjectDetailScreen }))
);
const CustomersScreen = lazy(() => import("@/screens/CustomersScreen").then((m) => ({ default: m.CustomersScreen })));
const InboxScreen = lazy(() => import("@/screens/InboxScreen").then((m) => ({ default: m.InboxScreen })));
const SearchScreen = lazy(() => import("@/screens/SearchScreen").then((m) => ({ default: m.SearchScreen })));
const NotificationsScreen = lazy(() =>
  import("@/screens/NotificationsScreen").then((m) => ({ default: m.NotificationsScreen }))
);
const SettingsScreen = lazy(() => import("@/screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));
const ProfileScreen = lazy(() => import("@/screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })));
const AdminScreen = lazy(() => import("@/screens/AdminScreen").then((m) => ({ default: m.AdminScreen })));
const ExportScreen = lazy(() => import("@/screens/ExportScreen").then((m) => ({ default: m.ExportScreen })));
const ActivityScreen = lazy(() => import("@/screens/ActivityScreen").then((m) => ({ default: m.ActivityScreen })));
const CalendarScreen = lazy(() => import("@/screens/CalendarScreen").then((m) => ({ default: m.CalendarScreen })));
const LanTransferScreen = lazy(() =>
  import("@/screens/LanTransferScreen").then((m) => ({ default: m.LanTransferScreen }))
);
const PublicMasterShareScreen = lazy(() =>
  import("@/screens/public/PublicMasterShareScreen").then((m) => ({ default: m.PublicMasterShareScreen }))
);
const PublicCustomerUploadScreen = lazy(() =>
  import("@/screens/public/PublicCustomerUploadScreen").then((m) => ({ default: m.PublicCustomerUploadScreen }))
);

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
      <PushNavigationHandler />
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
        <Route path="/calendar" element={<CalendarScreen />} />
        <Route path="/lan-transfer" element={<LanTransferScreen />} />
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
              <Suspense fallback={<SplashScreen />}>
                <RouterRoot />
              </Suspense>
            </HashRouter>
            <ToastStack />
            <UpdateNotifier />
            <RecoveryKeyModals />
            <DawAutoTracker />
            <WhatsNewModal />
            <AppContextMenu />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
