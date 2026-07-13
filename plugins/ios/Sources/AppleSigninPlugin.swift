import AuthenticationServices
import CryptoKit
import SwiftRs
import Tauri
import UIKit

struct SignInResult: Encodable {
  let identityToken: String
  let rawNonce: String
  let userIdentifier: String
  let email: String?
  let fullName: String?
}

/// Wraps Apple's native Sign In With Apple flow (system sheet, Face ID /
/// Touch ID) and hands the resulting identity token + raw nonce back to
/// JS, which exchanges them for a Firebase credential via
/// `OAuthProvider('apple.com').credential({idToken, rawNonce})`. Firebase
/// verifies the token itself against Apple's public keys — this plugin's
/// only job is producing a token Apple actually signed, with a nonce that
/// proves the request wasn't replayed.
class AppleSigninPlugin: Plugin, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private var pendingInvoke: Invoke?
  private var pendingRawNonce: String?

  @objc public func signIn(_ invoke: Invoke) throws {
    let rawNonce = randomNonceString()
    pendingInvoke = invoke
    pendingRawNonce = rawNonce

    let provider = ASAuthorizationAppleIDProvider()
    let request = provider.createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(rawNonce)

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard
      let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let identityTokenData = credential.identityToken,
      let identityToken = String(data: identityTokenData, encoding: .utf8),
      let rawNonce = pendingRawNonce
    else {
      pendingInvoke?.reject("Apple hat keinen gültigen Identitäts-Token geliefert.")
      clearPending()
      return
    }

    let fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .compactMap { $0 }
      .joined(separator: " ")

    let result = SignInResult(
      identityToken: identityToken,
      rawNonce: rawNonce,
      userIdentifier: credential.user,
      email: credential.email,
      fullName: fullName.isEmpty ? nil : fullName
    )
    pendingInvoke?.resolve(result)
    clearPending()
  }

  func authorizationController(
    controller: ASAuthorizationController, didCompleteWithError error: Error
  ) {
    let authError = error as? ASAuthorizationError
    if authError?.code == .canceled {
      pendingInvoke?.reject("Abgebrochen")
    } else {
      pendingInvoke?.reject(error.localizedDescription)
    }
    clearPending()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    // UIWindowScene.keyWindow is iOS 15+; this app's deployment target is
    // 14, so find the key window the iOS-13-compatible way instead.
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? UIWindow()
  }

  private func clearPending() {
    pendingInvoke = nil
    pendingRawNonce = nil
  }

  private func randomNonceString(length: Int = 32) -> String {
    let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remaining = length
    while remaining > 0 {
      var randomByte: UInt8 = 0
      _ = SecRandomCopyBytes(kSecRandomDefault, 1, &randomByte)
      if randomByte < charset.count {
        result.append(charset[Int(randomByte)])
        remaining -= 1
      }
    }
    return result
  }

  private func sha256(_ input: String) -> String {
    let hashed = SHA256.hash(data: Data(input.utf8))
    return hashed.map { String(format: "%02x", $0) }.joined()
  }
}

@_cdecl("init_plugin_apple_signin")
func initPlugin() -> Plugin {
  return AppleSigninPlugin()
}
