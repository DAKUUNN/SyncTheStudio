import FirebaseCore
import FirebaseMessaging
import SwiftRs
import Tauri
import UIKit
import UserNotifications

struct PushTokenResult: Encodable {
  let fcmToken: String
}

/// Requests notification permission, registers for APNs, and hands the
/// resulting Firebase Cloud Messaging token back to JS — which stores it
/// on the user's Firestore doc so a Cloud Function can target sends via
/// the standard `firebase-admin` messaging API.
class PushTokenPlugin: Plugin, MessagingDelegate {
  private static var pendingInvoke: Invoke?
  private static var delegateInjected = false

  override init() {
    super.init()
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }
    Messaging.messaging().delegate = self
    PushTokenPlugin.injectAppDelegateHooks()
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
