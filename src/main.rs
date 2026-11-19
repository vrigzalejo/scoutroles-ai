mod auth;
mod db;
mod jobs;
mod letter;
mod model;
mod score;
mod session;
mod state;
mod text;
mod view;
mod web;

use std::sync::Arc;
use std::time::Duration;

use sqlx::postgres::PgPoolOptions;
use tower_http::services::ServeDir;

use crate::auth::OAuthApp;
use crate::jobs::JobCache;
use crate::state::App;

#[tokio::main]
async fn main() {
    dotenvy::from_filename(".env.local").ok();
    let database = std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://scoutroles:scoutroles@localhost:5432/scoutroles".into());
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database)
        .await
        .expect("Postgres is not reachable. Start it with docker compose up -d db.");
    db::ensure(&pool).await.expect("could not prepare Postgres");
    let app = App {
        pool,
        http: reqwest::Client::builder().timeout(Duration::from_secs(20)).build().expect("http client"),
        oauth: OAuthApp::from_env(),
        jobs: Arc::new(JobCache::new()),
    };
    let router = web::router().fallback_service(ServeDir::new("static")).with_state(app);
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.expect("port");
    println!("ScoutRoles listening on http://localhost:{port}");
    axum::serve(listener, router).await.expect("server");
}
