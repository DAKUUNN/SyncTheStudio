use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_apple_signin);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<AppleSignin<R>> {
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_apple_signin)?;
  Ok(AppleSignin(handle))
}

/// Access to the apple-signin APIs.
pub struct AppleSignin<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AppleSignin<R> {
  pub fn sign_in(&self) -> crate::Result<SignInResponse> {
    self
      .0
      .run_mobile_plugin("signIn", SignInRequest::default())
      .map_err(Into::into)
  }
}
