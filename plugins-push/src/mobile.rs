use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_push_token);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<PushToken<R>> {
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_push_token)?;
  Ok(PushToken(handle))
}

/// Access to the push-token APIs.
pub struct PushToken<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> PushToken<R> {
  pub fn register(&self) -> crate::Result<PushTokenResponse> {
    self
      .0
      .run_mobile_plugin("register", RegisterRequest::default())
      .map_err(Into::into)
  }
}
