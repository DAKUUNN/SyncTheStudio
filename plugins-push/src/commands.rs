use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::PushTokenExt;
use crate::Result;

#[command]
pub(crate) async fn register<R: Runtime>(app: AppHandle<R>) -> Result<PushTokenResponse> {
  app.push_token().register()
}
