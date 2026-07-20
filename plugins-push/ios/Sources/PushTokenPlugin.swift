import FirebaseCore
import FirebaseMessaging
import SwiftRs
import Tauri
import UIKit
import UserNotifications

struct PushTokenResult: Encodable {
  let fcmToken: String
}

struct NotificationTapPayload: Encodable {
  let projectId: String?
  let screen: String?
}

/// Requests notification permission, registers for APNs, and hands the
/// resulting Firebase Cloud Messaging token back to JS — which stores it
/// on the user's Firestore doc so a Cloud Function can target sends via
/// the standard `firebase-admin` messaging API.
///
/// Also owns tap handling for those remote pushes: when the user taps a
/// chat/master-feedback/customer-upload notification, this forwards its
/// `projectId`/`screen` data payload to JS (see PushNavigationHandler.tsx)
/// so the app can jump straight to the right project tab instead of just
/// opening to the default screen.
class PushTokenPlugin: Plugin, MessagingDelegate, UNUserNotificationCenterDelegate {
  private static var pendingInvoke: Invoke?
  private static var delegateInjected = false

  /// tauri-plugin-notification also wants to be the UNUserNotificationCenter
  /// delegate (for its local, scheduled notifications — deadline reminders
  /// on desktop *and* iOS). There's only one delegate slot, and it force-
  /// unwraps its own bookkeeping for any notification it doesn't recognize,
  /// so simply overwriting its delegate would crash it on its own local
  /// notifications. Instead this chains through: remote (APNs/FCM) pushes
  /// are handled here, everything else — including local notifications
  /// whose trigger isn't a UNPushNotificationTrigger — is forwarded
  /// unchanged to whichever delegate was registered before us.
  private var previousDelegate: UNUserNotificationCenterDelegate?

  override init() {
    super.init()
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }
    Messaging.messaging().delegate = self
    PushTokenPlugin.injectAppDelegateHooks()

    let center = UNUserNotificationCenter.current()
    previousDelegate = center.delegate
    center.delegate = self
  }

  @objc public func register(_ invoke: Invoke) throws {
    PushTokenPlugin.pendingInvoke = invoke
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      guard granted else {
        DispatchQueue.main.async {
          PushTokenPlugin.pendingInvoke?.reject("Benachrichtigungen wurden nicht erlaubt.")
          PushTokenPlugin.pendingInvoke = nil
        }
        return
      }
      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    guard let token = fcmToken, PushTokenPlugin.pendingInvoke != nil else { return }
    PushTokenPlugin.pendingInvoke?.resolve(PushTokenResult(fcmToken: token))
    PushTokenPlugin.pendingInvoke = nil
  }

  // MARK: - UNUserNotificationCenterDelegate

  private func isRemotePush(_ trigger: UNNotificationTrigger?) -> Bool {
    trigger?.isKind(of: UNPushNotificationTrigger.self) == true
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    guard isRemotePush(notification.request.trigger) else {
      if let previousDelegate = previousDelegate,
        previousDelegate.responds(
          to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
        previousDelegate.userNotificationCenter?(
          center, willPresent: notification, withCompletionHandler: completionHandler)
      } else {
        completionHandler([])
      }
      return
    }
    // Show the banner/sound/badge for remote pushes while the app is in
    // the foreground, same as if no custom delegate were installed at all.
    completionHandler([.banner, .sound, .badge])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    guard isRemotePush(response.notification.request.trigger) else {
      if let previousDelegate = previousDelegate,
        previousDelegate.responds(
          to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
        previousDelegate.userNotificationCenter?(
          center, didReceive: response, withCompletionHandler: completionHandler)
      } else {
        completionHandler()
      }
      return
    }

    let userInfo = response.notification.request.content.userInfo
    let payload = NotificationTapPayload(
      projectId: userInfo["projectId"] as? String,
      screen: userInfo["screen"] as? String
    )
    try? self.trigger("notificationTapped", data: payload)
    completionHandler()
  }

  // MARK: - AppDelegate method injection
  //
  // Tauri's iOS runtime (via the `tao` crate) creates its own
  // UIApplicationDelegate at startup but never implements the two APNs
  // registration callbacks, since Tauri has no built-in push-notification
  // concept — without them iOS silently never tells the app its device
  // token. This adds both callbacks onto that delegate's class at
  // runtime, once, the first time this plugin loads. It only ever adds
  // methods that don't already exist (class_addMethod, not swizzling an
  // existing implementation), so it can't clobber anything tao itself
  // relies on.
  private static func injectAppDelegateHooks() {
    guard !delegateInjected else { return }
    delegateInjected = true

    guard let delegate = UIApplication.shared.delegate else { return }
    let cls: AnyClass = type(of: delegate)

    let successSelector = #selector(
      UIApplicationDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:))
    if !cls.instancesRespond(to: successSelector) {
      let block: @convention(block) (AnyObject, UIApplication, Data) -> Void = { _, _, deviceToken in
        Messaging.messaging().apnsToken = deviceToken
      }
      class_addMethod(cls, successSelector, imp_implementationWithBlock(block), "v@:@@")
    }

    let failureSelector = #selector(
      UIApplicationDelegate.application(_:didFailToRegisterForRemoteNotificationsWithError:))
    if !cls.instancesRespond(to: failureSelector) {
      let block: @convention(block) (AnyObject, UIApplication, Error) -> Void = { _, _, error in
        DispatchQueue.main.async {
          pendingInvoke?.reject(error.localizedDescription)
          pendingInvoke = nil
        }
      }
      class_addMethod(cls, failureSelector, imp_implementationWithBlock(block), "v@:@@")
    }
  }
}

@_cdecl("init_plugin_push_token")
func initPlugin() -> Plugin {
  return PushTokenPlugin()
}
