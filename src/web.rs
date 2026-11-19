use askama::Template;
use axum::extract::{Form, Path, Query, State};
use axum::http::HeaderMap;
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::Router;
use chrono::Utc;
use serde::Deserialize;

use crate::auth;
use crate::db;
use crate::letter;
use crate::model::{Profile, Provider, Tracked};
use crate::score;
use crate::session;
use crate::state::App;
use crate::text::percent_encode;
use crate::view;

pub fn router() -> Router<App> {
    Router::new()
        .route("/", get(index))
        .route("/tracker", get(tracker))
        .route("/brief", post(brief))
        .route("/track", post(track))
        .route("/letter", post(letter))
        .route("/logout", get(logout_ask).post(logout))
        .route("/api/pass/oauth/{provider}", get(oauth_start))
        .route("/api/pass/oauth/callback", get(oauth_callback))
}

#[derive(Deserialize)]
struct HomeQuery {
    ranked: Option<String>,
    refresh: Option<String>,
    open: Option<String>,
    notice: Option<String>,
}

async fn index(State(app): State<App>, headers: HeaderMap, Query(query): Query<HomeQuery>) -> Response {
    render(&app, &headers, false, query.ranked.is_some(), query.refresh.is_some(), query.open.as_deref(), query.notice.as_deref(), false).await
}

async fn tracker(State(app): State<App>, headers: HeaderMap) -> Response {
    render(&app, &headers, true, false, false, None, None, false).await
}

async fn render(
    app: &App,
    headers: &HeaderMap,
    tracker_view: bool,
    ranked: bool,
    refresh: bool,
    open: Option<&str>,
    notice: Option<&str>,
    logout_ask: bool,
) -> Response {
    let session = session::load(app, headers).await;
    let profile = session.as_ref().map(|item| item.profile.clone()).unwrap_or_default();
    let tracked = session.as_ref().map(|item| item.tracker.clone()).unwrap_or_default();
    let mut page = view::Home::from_profile(
        &profile,
        session.is_some(),
        session.as_ref().map(|item| item.pass.email.as_str()).unwrap_or(""),
        session.as_ref().and_then(|item| item.pass.provider.as_deref()).unwrap_or(""),
    );
    page.tracker_view = tracker_view;
    page.tracker = view::tracks(&tracked);
    page.notice = view::notice(notice.unwrap_or(""));
    page.logout_ask = logout_ask && session.is_some();
    if ranked && session.is_some() {
        fill_rankings(app, &mut page, &profile, &tracked, refresh, open).await;
    }
    Html(page.render().unwrap_or_else(|error| error.to_string())).into_response()
}

async fn fill_rankings(app: &App, page: &mut view::Home, profile: &Profile, tracked: &[Tracked], refresh: bool, open: Option<&str>) {
    let (jobs, reports, sample) = app.jobs.load(&app.http, refresh).await;
    let jobs = jobs.into_iter().filter(|job| !profile.remote_only || job.remote).collect();
    let scored = score::score_jobs(jobs, profile);
    page.total = scored.len();
    page.shown = scored.len().min(24);
    page.sample_mode = sample;
    page.ranked = true;
    page.sources = view::sources(&reports);
    if let Some(id) = open {
        if let Some(role) = scored.iter().find(|item| item.job.id == id) {
            let saved = tracked.iter().find(|item| item.id == role.job.id);
            let letter = saved
                .map(|item| item.letter.clone())
                .filter(|letter| !letter.is_empty())
                .unwrap_or_else(|| letter::local_letter(profile, role));
            page.show_role(role, letter);
        }
    }
    page.jobs = view::cards(&scored);
}

#[derive(Deserialize)]
struct BriefForm {
    #[serde(default)]
    name: String,
    #[serde(default)]
    roles: String,
    #[serde(default)]
    location: String,
    #[serde(default)]
    resume: String,
    #[serde(default)]
    remote_only: String,
    #[serde(default)]
    action: String,
}

async fn brief(State(app): State<App>, headers: HeaderMap, Form(form): Form<BriefForm>) -> Response {
    let Some(session) = session::load(&app, &headers).await else {
        if form.action == "sample" {
            let page = view::Home::from_profile(&Profile::sample(), false, "", "");
            return Html(page.render().unwrap_or_default()).into_response();
        }
        return Redirect::to("/?notice=failed").into_response();
    };
    let profile = profile_from_form(&form);
    if db::write_profile(&app.pool, &session.pass.id, &profile).await.is_err() {
        return Redirect::to("/?notice=failed").into_response();
    }
    if form.action == "rank" {
        Redirect::to("/?ranked=1").into_response()
    } else {
        Redirect::to("/").into_response()
    }
}

fn profile_from_form(form: &BriefForm) -> Profile {
    if form.action == "sample" {
        let mut sample = Profile::sample();
        if !form.name.trim().is_empty() {
            sample.name = form.name.clone();
        }
        return sample;
    }
    Profile {
        name: form.name.clone(),
        roles: form.roles.clone(),
        location: form.location.clone(),
        remote_only: form.remote_only == "on",
        resume: form.resume.clone(),
        gemini_key: String::new(),
    }
}

#[derive(Deserialize)]
struct IdForm {
    id: String,
    #[serde(default)]
    letter: String,
}

async fn track(State(app): State<App>, headers: HeaderMap, Form(form): Form<IdForm>) -> Response {
    save_role(&app, &headers, &form.id, None).await
}

async fn letter(State(app): State<App>, headers: HeaderMap, Form(form): Form<IdForm>) -> Response {
    save_role(&app, &headers, &form.id, Some(form.letter)).await
}

async fn save_role(app: &App, headers: &HeaderMap, id: &str, letter: Option<String>) -> Response {
    let Some(session) = session::load(app, headers).await else {
        return Redirect::to("/").into_response();
    };
    let (jobs, _, _) = app.jobs.load(&app.http, false).await;
    let scored = score::score_jobs(jobs, &session.profile);
    let Some(role) = scored.into_iter().find(|item| item.job.id == id) else {
        return Redirect::to("/?ranked=1").into_response();
    };
    let previous = session.tracker.into_iter().find(|item| item.id == id);
    let letter_text = letter.unwrap_or_else(|| previous.as_ref().map(|item| item.letter.clone()).unwrap_or_default());
    let letter_text = if letter_text.trim().is_empty() { letter::local_letter(&session.profile, &role) } else { letter_text };
    let tracked = Tracked {
        id: role.job.id.clone(),
        title: role.job.title.clone(),
        company: role.job.company.clone(),
        location: role.job.location.clone(),
        url: role.job.url.clone(),
        apply_url: role.job.apply_url.clone(),
        source: role.job.source.clone(),
        source_home: role.job.source_home.clone(),
        salary: role.job.salary.clone(),
        description: role.job.description.clone(),
        score: role.score,
        matched: role.matched.clone(),
        missing: role.missing.clone(),
        reasons: role.reasons.clone(),
        status: previous.map(|item| item.status).unwrap_or_else(|| "saved".into()),
        letter: letter_text,
        tailored: String::new(),
        note: String::new(),
        updated_at: Utc::now().to_rfc3339(),
    };
    let _ = db::write_tracked(&app.pool, &session.pass.id, &tracked).await;
    Redirect::to(&format!("/?ranked=1&open={}", percent_encode(id))).into_response()
}

async fn logout_ask(State(app): State<App>, headers: HeaderMap) -> Response {
    let busy = session::load(&app, &headers).await.is_some_and(|session| !session.profile.resume.trim().is_empty() || !session.tracker.is_empty());
    if !busy {
        return logout(State(app), headers).await;
    }
    render(&app, &headers, false, false, false, None, None, true).await
}

async fn logout(State(_app): State<App>, _headers: HeaderMap) -> Response {
    session::set_cookie(Redirect::to("/").into_response(), session::PASS, "", 0)
}

async fn oauth_start(State(app): State<App>, Path(provider): Path<String>, headers: HeaderMap) -> Response {
    let Some(provider) = Provider::parse(&provider) else {
        return Redirect::to("/?notice=failed").into_response();
    };
    if !app.oauth.ready(provider) {
        return Redirect::to(&format!("/?notice={}-setup", provider.as_str())).into_response();
    }
    let (verifier, challenge) = auth::pkce();
    let state = auth::random_state();
    let redirect = format!("{}/api/pass/oauth/callback", session::origin(&headers));
    let url = auth::authorize_url(&app.oauth, provider, &redirect, &state, &challenge);
    let pending = serde_json::json!({ "state": state, "verifier": verifier, "provider": provider.as_str() }).to_string();
    session::set_cookie(Redirect::to(&url).into_response(), session::OAUTH, &pending, 600)
}

#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

async fn oauth_callback(State(app): State<App>, headers: HeaderMap, Query(query): Query<CallbackQuery>) -> Response {
    if query.error.as_deref() == Some("access_denied") {
        return session::clear_oauth(Redirect::to("/?notice=denied").into_response());
    }
    let Some(pending_raw) = session::cookie(&headers, session::OAUTH) else {
        return Redirect::to("/?notice=failed").into_response();
    };
    let pending: serde_json::Value = serde_json::from_str(&pending_raw).unwrap_or(serde_json::json!({}));
    let Some(provider) = pending.get("provider").and_then(|value| value.as_str()).and_then(Provider::parse) else {
        return session::clear_oauth(Redirect::to("/?notice=failed").into_response());
    };
    let verifier = pending.get("verifier").and_then(|value| value.as_str()).unwrap_or("");
    let state = pending.get("state").and_then(|value| value.as_str()).unwrap_or("");
    let Some(code) = query.code.filter(|_| !state.is_empty() && state == query.state.unwrap_or_default()) else {
        return session::clear_oauth(Redirect::to("/?notice=failed").into_response());
    };
    let redirect_uri = format!("{}/api/pass/oauth/callback", session::origin(&headers));
    let Ok((email, subject)) = auth::identity(&app.http, &app.oauth, provider, &redirect_uri, &code, verifier).await else {
        return session::clear_oauth(Redirect::to("/?notice=failed").into_response());
    };
    let Ok(pass) = db::open_oauth(&app.pool, provider, &email, &subject).await else {
        return session::clear_oauth(Redirect::to("/?notice=failed").into_response());
    };
    session::clear_oauth(session::set_cookie(Redirect::to("/").into_response(), session::PASS, &pass.token, 60 * 60 * 24 * 400))
}
