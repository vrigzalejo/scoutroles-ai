use axum::http::{header, HeaderMap};
use axum::response::Response;

use crate::db;
use crate::model::{Pass, Profile, Tracked};
use crate::state::App;
use crate::text::{percent_decode, percent_encode};

pub const PASS: &str = "scoutroles_pass";
pub const OAUTH: &str = "scoutroles_oauth";

pub struct Session {
    pub pass: Pass,
    pub profile: Profile,
    pub tracker: Vec<Tracked>,
}

pub async fn load(app: &App, headers: &HeaderMap) -> Option<Session> {
    let token = cookie(headers, PASS)?;
    let pass = db::find_pass(&app.pool, &token).await.ok().flatten()?;
    let profile = db::read_profile(&app.pool, &pass.id).await.unwrap_or_default();
    let tracker = db::read_tracker(&app.pool, &pass.id).await.unwrap_or_default();
    Some(Session { pass, profile, tracker })
}

pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let mut pair = part.trim().splitn(2, '=');
        if pair.next() == Some(name) {
            return pair.next().map(percent_decode);
        }
    }
    None
}

pub fn origin(headers: &HeaderMap) -> String {
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()) {
        if origin.starts_with("http") {
            return origin.to_string();
        }
    }
    let host = headers.get(header::HOST).and_then(|value| value.to_str().ok()).unwrap_or("localhost:3000");
    format!("http://{host}")
}

pub fn set_cookie(mut response: Response, name: &str, value: &str, max_age: i64) -> Response {
    let cookie = format!("{name}={}; HttpOnly; SameSite=Lax; Path=/; Max-Age={max_age}", percent_encode(value));
    if let Ok(value) = cookie.parse() {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
    response
}

pub fn clear_oauth(response: Response) -> Response {
    set_cookie(response, OAUTH, "", 0)
}
