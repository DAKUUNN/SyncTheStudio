use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<PushToken<R>> {
  Ok(PushToken(app.clone()))
}

/// Access to the push-token APIs. Remote push is iOS-only here — the UI
/// never calls this outside iOS, so this path is unreachable in
/// practice, but it must still compile for desktop/macOS targets.
pub struct PushToken<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> PushToken<R> {
  pub fn register(&self) -> crate::Result<PushTokenResponse> {
    Err(crate::Error::Io(std::io::Error::new(
      std::io::ErrorKind::Unsupported,
      "Push notifications are only available on iOS",
    )))
  }
}
