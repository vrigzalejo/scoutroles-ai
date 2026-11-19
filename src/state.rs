use std::sync::Arc;

use crate::auth::OAuthApp;
use crate::jobs::JobCache;

#[derive(Clone)]
pub struct App {
    pub pool: sqlx::PgPool,
    pub http: reqwest::Client,
    pub oauth: OAuthApp,
    pub jobs: Arc<JobCache>,
}
