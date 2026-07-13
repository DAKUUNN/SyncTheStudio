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
use desktop::AppleSignin;
#[cfg(mobile)]
use mobile::AppleSignin;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the apple-signin APIs.
pub trait AppleSigninExt<R: Runtime> {
  fn apple_signin(&self) -> &AppleSignin<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AppleSigninExt<R> for T {
  fn apple_signin(&self) -> &AppleSignin<R> {
    self.state::<AppleSignin<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("apple-signin")
    .invoke_handler(tauri::generate_handler![commands::sign_in])
    .setup(|app, api| {
      #[cfg(mobile)]
      let apple_signin = mobile::init(app, api)?;
      #[cfg(desktop)]
      let apple_signin = desktop::init(app, api)?;
      app.manage(apple_signin);
      Ok(())
    })
    .build()
}
