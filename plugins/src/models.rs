use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInRequest {}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInResponse {
  pub identity_token: String,
  pub raw_nonce: String,
  pub user_identifier: String,
  pub email: Option<String>,
  pub full_name: Option<String>,
}
