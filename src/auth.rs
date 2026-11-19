use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::model::Provider;
use crate::text::percent_encode;

#[derive(Clone)]
pub struct OAuthApp {
    google_id: String,
    google_secret: String,
    github_id: String,
    github_secret: String,
}

impl OAuthApp {
    pub fn from_env() -> Self {
        Self {
            google_id: env("GOOGLE_CLIENT_ID"),
            google_secret: env("GOOGLE_CLIENT_SECRET"),
            github_id: env("GITHUB_CLIENT_ID"),
            github_secret: env("GITHUB_CLIENT_SECRET"),
        }
    }

    pub fn ready(&self, provider: Provider) -> bool {
        let (id, secret) = match provider {
            Provider::Google => (&self.google_id, &self.google_secret),
            Provider::Github => (&self.github_id, &self.github_secret),
        };
        !id.is_empty() && !secret.is_empty()
    }
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_default().trim().to_string()
}

pub fn pkce() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

pub fn authorize_url(app: &OAuthApp, provider: Provider, redirect: &str, state: &str, challenge: &str) -> String {
    match provider {
        Provider::Github => format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=user:email&state={}&code_challenge={}&code_challenge_method=S256",
            percent_encode(&app.github_id),
            percent_encode(redirect),
            percent_encode(state),
            percent_encode(challenge)
        ),
        Provider::Google => format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}&code_challenge={}&code_challenge_method=S256&prompt=select_account",
            percent_encode(&app.google_id),
            percent_encode(redirect),
            percent_encode(state),
            percent_encode(challenge)
        ),
    }
}

#[derive(Deserialize)]
struct GoogleUser {
    sub: String,
    email: Option<String>,
    email_verified: Option<bool>,
}

#[derive(Deserialize)]
struct GitHubUser {
    id: u64,
}

#[derive(Deserialize)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

pub async fn identity(http: &reqwest::Client, app: &OAuthApp, provider: Provider, redirect: &str, code: &str, verifier: &str) -> Result<(String, String), String> {
    match provider {
        Provider::Github => github_identity(http, app, redirect, code, verifier).await,
        Provider::Google => google_identity(http, app, redirect, code, verifier).await,
    }
}

async fn google_identity(http: &reqwest::Client, app: &OAuthApp, redirect: &str, code: &str, verifier: &str) -> Result<(String, String), String> {
    let token: serde_json::Value = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", app.google_id.as_str()),
            ("client_secret", app.google_secret.as_str()),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    let access = token.get("access_token").and_then(|value| value.as_str()).unwrap_or("");
    if access.is_empty() {
        return Err("Google did not confirm this account.".into());
    }
    let user: GoogleUser = http
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    if user.email_verified == Some(false) {
        return Err("Google did not confirm the email.".into());
    }
    let email = user.email.unwrap_or_default();
    if email.is_empty() || user.sub.is_empty() {
        return Err("Google did not share an email.".into());
    }
    Ok((email, user.sub))
}

async fn github_identity(http: &reqwest::Client, app: &OAuthApp, redirect: &str, code: &str, verifier: &str) -> Result<(String, String), String> {
    let token: serde_json::Value = http
        .post("https://github.com/login/oauth/access_token")
        .header("accept", "application/json")
        .json(&serde_json::json!({
            "client_id": app.github_id,
            "client_secret": app.github_secret,
            "code": code,
            "redirect_uri": redirect,
            "code_verifier": verifier
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    let access = token.get("access_token").and_then(|value| value.as_str()).unwrap_or("");
    if access.is_empty() {
        return Err("GitHub did not confirm this account.".into());
    }
    let user: GitHubUser = http
        .get("https://api.github.com/user")
        .bearer_auth(access)
        .header("user-agent", "ScoutRoles")
        .header("accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    let emails: Vec<GitHubEmail> = http
        .get("https://api.github.com/user/emails")
        .bearer_auth(access)
        .header("user-agent", "ScoutRoles")
        .header("accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    let chosen = emails.iter().find(|item| item.primary && item.verified).or_else(|| emails.iter().find(|item| item.verified));
    let Some(chosen) = chosen else {
        return Err("GitHub did not confirm an email.".into());
    };
    Ok((chosen.email.clone(), user.id.to_string()))
}

pub fn random_state() -> String {
    let mut bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
