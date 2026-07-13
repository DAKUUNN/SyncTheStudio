import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import { hasPremiumStorage } from "@/services/planService";
import { useIsIOS } from "@/lib/platform";
import { IconArrowRight, IconCheck, IconStar, IconX } from "./Icons";

export interface TourStep {
  target: string | null;
  titleKey: string;
  descKey: string;
  premium?: boolean;
}

// On the mobile tab-bar layout, Aktivität/Einstellungen/Export/Profil live
// inside the collapsed "Mehr" sheet instead of the always-visible desktop
// sidebar — their sidebar-only data-tour ids never match anything, so the
// step silently falls back to a centered, un-spotlighted card. Redirecting
// those specific steps at the "Mehr" tab itself (always in the DOM) keeps
// every step pointing at something real instead of nothing.
function accountSteps(isPremium: boolean, isMobile: boolean): TourStep[] {
  const sidebarOnly = (target: string) => (isMobile ? "nav-more" : target);
  return [
    { target: null, titleKey: "onboarding.welcome.title", descKey: "onboarding.welcome.desc" },
    { target: "new-project", titleKey: "onboarding.newProject.title", descKey: "onboarding.newProject.desc" },
    { target: "nav-projects", titleKey: "onboarding.projects.title", descKey: "onboarding.projects.desc" },
    { target: "nav-customers", titleKey: "onboarding.customers.title", descKey: "onboarding.customers.desc" },
    { target: sidebarOnly("nav-activity"), titleKey: "onboarding.activity.title", descKey: "onboarding.activity.desc" },
    { target: "search", titleKey: "onboarding.search.title", descKey: "onboarding.search.desc" },
    { target: "notifications", titleKey: "onboarding.notifications.title", descKey: "onboarding.notifications.desc" },
    { target: sidebarOnly("nav-settings"), titleKey: "onboarding.settings.title", descKey: "onboarding.settings.desc" },
    {
      target: sidebarOnly("nav-export"),
      titleKey: "onboarding.export.title",
      descKey: "onboarding.export.desc",
      premium: !isPremium,
    },
    { target: sidebarOnly("profile"), titleKey: "onboarding.profile.title", descKey: "onboarding.profile.desc" },
  ];
}

const ACCOUNT_RESTART_EVENT = "sts:restart-onboarding";
const accountSeenKey = (userId: string) => `sts_onboarding_seen_${userId}`;

export function hasSeenOnboarding(userId: string): boolean {
  return window.localStorage.getItem(accountSeenKey(userId)) !== null;
}

/** Clears the "seen" flag and immediately (re)starts an already-mounted
 *  OnboardingTour — used by the "replay tutorial" button in Settings. */
export function restartOnboarding(userId: string): void {
  window.localStorage.removeItem(accountSeenKey(userId));
  window.dispatchEvent(new Event(ACCOUNT_RESTART_EVENT));
}

/** Original coach-mark style tour (spotlight + connected tooltip card),
 *  scoped to the always-mounted sidebar/topbar elements so it works
 *  regardless of which page a brand-new, data-less account lands on.
 *  Auto-starts once per account; replayable from Settings via
 *  restartOnboarding(). */
export function OnboardingTour() {
  const { currentUser } = useAuth();
  const isMobile = useIsIOS();
  const steps = useMemo(
    () => (currentUser ? accountSteps(hasPremiumStorage(currentUser), isMobile) : []),
    [currentUser, isMobile]
  );
  if (!currentUser) return null;
  return (
    <TourRunner
      steps={steps}
      storageKey={accountSeenKey(currentUser.id)}
      restartEventName={ACCOUNT_RESTART_EVENT}
    />
  );
}

/** Shared spotlight-tour engine — steps target elements via a
 *  `data-tour="<id>"` attribute anywhere in the current DOM. Reused by both
 *  the account-level OnboardingTour and page-specific tours (e.g. the
 *  project detail tab walkthrough). */
export function TourRunner({
  steps,
  storageKey,
  restartEventName,
  ready = true,
  startDelay = 600,
}: {
  steps: TourStep[];
  storageKey: string;
  restartEventName: string;
  ready?: boolean;
  startDelay?: number;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (window.localStorage.getItem(storageKey) !== null) return;
    const timer = window.setTimeout(() => setActive(true), startDelay);
    return () => window.clearTimeout(timer);
  }, [ready, storageKey, startDelay]);

  useEffect(() => {
    const onRestart = () => {
      setStepIndex(0);
      setActive(true);
    };
    window.addEventListener(restartEventName, onRestart);
    return () => window.removeEventListener(restartEventName, onRestart);
  }, [restartEventName]);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!active) return;
    const update = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const box = el?.getBoundingClientRect();
      // A matched-but-hidden element (display:none, e.g. the desktop
      // sidebar collapsed on a mobile layout) reports a zero-size rect
      // rather than being absent — treat that the same as "not found"
      // instead of spotlighting an invisible 0×0 box.
      setRect(box && box.width > 0 && box.height > 0 ? box : null);
    };
    update();
    window.addEventListener("resize", update);
    const interval = window.setInterval(update, 200);
    return () => {
      window.removeEventListener("resize", update);
      window.clearInterval(interval);
    };
  }, [active, step]);

  const finish = useMemo(
    () => () => {
      window.localStorage.setItem(storageKey, "1");
      setActive(false);
      setStepIndex(0);
    },
    [storageKey]
  );

  if (!active) return null;

  const isLast = stepIndex === steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const tooltipStyle = rect
    ? placeTooltip(rect)
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="tour-layer">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div className="tour-card" style={tooltipStyle}>
        <div className="tour-progress-track">
          <div className="tour-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <span className="text-xs text-muted">
            {t("onboarding.stepOf", { step: stepIndex + 1, total: steps.length })}
          </span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={finish}>
            <IconX style={{ width: 12, height: 12 }} />
          </button>
        </div>

        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <div className="tour-card-title">{t(step.titleKey)}</div>
          {step.premium && (
            <span className="tour-premium-badge" title={t("plan.premium")}>
              <IconStar style={{ width: 10, height: 10 }} /> {t("plan.premium")}
            </span>
          )}
        </div>
        <div className="text-small text-muted" style={{ marginBottom: 14 }}>
          {t(step.descKey)}
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-secondary btn-sm" onClick={finish}>
            {t("onboarding.skip")}
          </button>
          <div className="row" style={{ gap: 8 }}>
            {stepIndex > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                {t("onboarding.back")}
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
            >
              {isLast ? (
                <>
                  <IconCheck style={{ width: 13, height: 13 }} /> {t("onboarding.done")}
                </>
              ) : (
                <>
                  {t("onboarding.next")} <IconArrowRight style={{ width: 13, height: 13 }} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function placeTooltip(rect: DOMRect): React.CSSProperties {
  const cardWidth = 320;
  const estCardHeight = 250;
  const margin = 16;
  const spaceRight = window.innerWidth - rect.right;

  let top: number;
  let left: number;

  if (spaceRight > cardWidth + margin * 2) {
    left = rect.right + margin;
    top = rect.top;
  } else {
    left = rect.left;
    top = rect.bottom + margin;
  }

  // Clamp on both axes regardless of which branch placed the card — a
  // target near the bottom (e.g. the sidebar profile button) would
  // otherwise still push the card off-screen even in the "place to the
  // right" branch, which only accounted for the horizontal axis.
  top = Math.max(margin, Math.min(top, window.innerHeight - estCardHeight - margin));
  left = Math.max(margin, Math.min(left, window.innerWidth - cardWidth - margin));

  return { top, left };
}
