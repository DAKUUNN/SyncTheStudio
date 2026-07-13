use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<AppleSignin<R>> {
  Ok(AppleSignin(app.clone()))
}

/// Access to the apple-signin APIs. Sign In With Apple is iOS-only here —
/// the UI never shows the button outside iOS, so this path is unreachable
/// in practice, but it must still compile for desktop/macOS targets.
pub struct AppleSignin<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> AppleSignin<R> {
  pub fn sign_in(&self) -> crate::Result<SignInResponse> {
    Err(crate::Error::Io(std::io::Error::new(
      std::io::ErrorKind::Unsupported,
      "Sign In With Apple is only available on iOS",
    )))
  }
}
