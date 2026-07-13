use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::PushToken;
#[cfg(mobile)]
use mobile::PushToken;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the push-token APIs.
pub trait PushTokenExt<R: Runtime> {
  fn push_token(&self) -> &PushToken<R>;
}

impl<R: Runtime, T: Manager<R>> crate::PushTokenExt<R> for T {
  fn push_token(&self) -> &PushToken<R> {
    self.state::<PushToken<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("push-token")
    .invoke_handler(tauri::generate_handler![commands::register])
    .setup(|app, api| {
      #[cfg(mobile)]
      let push_token = mobile::init(app, api)?;
      #[cfg(desktop)]
      let push_token = desktop::init(app, api)?;
      app.manage(push_token);
      Ok(())
    })
    .build()
}
