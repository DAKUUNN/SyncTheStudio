use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::AppleSigninExt;
use crate::Result;

#[command]
pub(crate) async fn sign_in<R: Runtime>(app: AppHandle<R>) -> Result<SignInResponse> {
  app.apple_signin().sign_in()
}
