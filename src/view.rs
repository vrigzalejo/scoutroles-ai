use askama::Template;

use crate::model::{Profile, Scored, SourceReport, Tracked};

#[derive(Template)]
#[template(path = "page.html")]
pub struct Home {
    pub signed_in: bool,
    pub email: String,
    pub provider: String,
    pub name: String,
    pub roles: String,
    pub location: String,
    pub remote_only: bool,
    pub resume: String,
    pub ranked: bool,
    pub tracker_view: bool,
    pub total: usize,
    pub shown: usize,
    pub sample_mode: bool,
    pub notice: String,
    pub logout_ask: bool,
    pub jobs: Vec<JobCard>,
    pub tracker: Vec<TrackCard>,
    pub sources: Vec<SourceCard>,
    pub role_open: bool,
    pub role_id: String,
    pub role_title: String,
    pub role_company: String,
    pub role_location: String,
    pub role_score: i32,
    pub role_url: String,
    pub role_letter: String,
    pub role_reasons: String,
}

pub struct JobCard {
    pub id: String,
    pub title: String,
    pub company: String,
    pub location: String,
    pub salary: String,
    pub score: i32,
    pub source: String,
    pub url: String,
    pub reasons: String,
}

pub struct TrackCard {
    pub title: String,
    pub company: String,
    pub status: String,
    pub url: String,
}

pub struct SourceCard {
    pub name: String,
    pub home: String,
    pub ok: bool,
    pub count: usize,
}

impl Default for Home {
    fn default() -> Self {
        Self {
            signed_in: false,
            email: String::new(),
            provider: String::new(),
            name: String::new(),
            roles: String::new(),
            location: String::new(),
            remote_only: true,
            resume: String::new(),
            ranked: false,
            tracker_view: false,
            total: 0,
            shown: 0,
            sample_mode: false,
            notice: String::new(),
            logout_ask: false,
            jobs: Vec::new(),
            tracker: Vec::new(),
            sources: Vec::new(),
            role_open: false,
            role_id: String::new(),
            role_title: String::new(),
            role_company: String::new(),
            role_location: String::new(),
            role_score: 0,
            role_url: String::new(),
            role_letter: String::new(),
            role_reasons: String::new(),
        }
    }
}

impl Home {
    pub fn from_profile(profile: &Profile, signed_in: bool, email: &str, provider: &str) -> Self {
        Self {
            signed_in,
            email: email.into(),
            provider: if provider.is_empty() { "this account".into() } else { provider.into() },
            name: profile.name.clone(),
            roles: profile.roles.clone(),
            location: profile.location.clone(),
            remote_only: profile.remote_only,
            resume: profile.resume.clone(),
            ..Self::default()
        }
    }

    pub fn show_role(&mut self, scored: &Scored, letter: String) {
        self.role_open = true;
        self.role_id = scored.job.id.clone();
        self.role_title = scored.job.title.clone();
        self.role_company = scored.job.company.clone();
        self.role_location = scored.job.location.clone();
        self.role_score = scored.score;
        self.role_url = scored.job.url.clone();
        self.role_reasons = scored.reasons.join(" ");
        self.role_letter = letter;
    }
}

pub fn cards(scored: &[Scored]) -> Vec<JobCard> {
    scored
        .iter()
        .take(24)
        .map(|item| JobCard {
            id: item.job.id.clone(),
            title: item.job.title.clone(),
            company: item.job.company.clone(),
            location: item.job.location.clone(),
            salary: item.job.salary.clone(),
            score: item.score,
            source: item.job.source.clone(),
            url: item.job.url.clone(),
            reasons: item.reasons.join(" "),
        })
        .collect()
}

pub fn tracks(items: &[Tracked]) -> Vec<TrackCard> {
    items
        .iter()
        .map(|item| TrackCard {
            title: item.title.clone(),
            company: item.company.clone(),
            status: item.status.clone(),
            url: item.url.clone(),
        })
        .collect()
}

pub fn sources(items: &[SourceReport]) -> Vec<SourceCard> {
    items
        .iter()
        .map(|item| SourceCard {
            name: item.name.clone(),
            home: item.home.clone(),
            ok: item.ok,
            count: item.count,
        })
        .collect()
}

pub fn notice(code: &str) -> String {
    match code {
        "google-setup" => "Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.".into(),
        "github-setup" => "GitHub needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.local.".into(),
        "denied" => "The sign-in was cancelled.".into(),
        "failed" => "That sign-in could not be confirmed. Try again.".into(),
        "" => String::new(),
        _ => "That sign-in could not be confirmed. Try again.".into(),
    }
}
