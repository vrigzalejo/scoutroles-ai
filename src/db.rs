use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::model::{Pass, Profile, Provider, Tracked};

const PASS_COLUMNS: &str = "id::text AS id, token, email, provider";

pub async fn ensure(pool: &PgPool) -> Result<(), sqlx::Error> {
    for statement in [
        r#"CREATE TABLE IF NOT EXISTS passes (
          id uuid PRIMARY KEY,
          token text NOT NULL UNIQUE,
          email text NOT NULL,
          stripe_session_id text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL,
          expires_at timestamptz NOT NULL,
          letters_used integer NOT NULL,
          letter_quota integer NOT NULL,
          password_hash text,
          password_salt text,
          provider text,
          google_sub text,
          microsoft_sub text,
          apple_sub text,
          github_sub text
        )"#,
        "CREATE UNIQUE INDEX IF NOT EXISTS passes_google_sub_key ON passes (google_sub) WHERE google_sub IS NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS passes_github_sub_key ON passes (github_sub) WHERE github_sub IS NOT NULL",
        r#"CREATE TABLE IF NOT EXISTS trackers (
          pass_id uuid PRIMARY KEY REFERENCES passes (id) ON DELETE CASCADE,
          data jsonb NOT NULL
        )"#,
        r#"CREATE TABLE IF NOT EXISTS profiles (
          pass_id uuid PRIMARY KEY REFERENCES passes (id) ON DELETE CASCADE,
          data jsonb NOT NULL
        )"#,
    ] {
        sqlx::query(statement).execute(pool).await?;
    }
    Ok(())
}

pub async fn find_pass(pool: &PgPool, token: &str) -> Result<Option<Pass>, sqlx::Error> {
    sqlx::query_as::<_, Pass>(&format!("SELECT {PASS_COLUMNS} FROM passes WHERE token = $1"))
        .bind(token)
        .fetch_optional(pool)
        .await
}

pub async fn open_oauth(pool: &PgPool, provider: Provider, email: &str, subject: &str) -> Result<Pass, sqlx::Error> {
    let email = email.trim().to_lowercase();
    if let Some(pass) = find_by_subject(pool, provider, subject).await? {
        touch_email(pool, &pass.id, provider, &email).await?;
        return reload(pool, &pass.token).await;
    }
    if let Some(pass) = find_by_email(pool, &email).await? {
        attach_subject(pool, &pass.id, provider, subject).await?;
        return reload(pool, &pass.token).await;
    }
    insert_pass(pool, provider, &email, subject).await
}

async fn find_by_subject(pool: &PgPool, provider: Provider, subject: &str) -> Result<Option<Pass>, sqlx::Error> {
    let sql = match provider {
        Provider::Google => format!("SELECT {PASS_COLUMNS} FROM passes WHERE google_sub = $1 LIMIT 1"),
        Provider::Github => format!("SELECT {PASS_COLUMNS} FROM passes WHERE github_sub = $1 LIMIT 1"),
    };
    sqlx::query_as::<_, Pass>(&sql).bind(subject).fetch_optional(pool).await
}

async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Pass>, sqlx::Error> {
    sqlx::query_as::<_, Pass>(&format!("SELECT {PASS_COLUMNS} FROM passes WHERE email = $1 ORDER BY expires_at DESC LIMIT 1"))
        .bind(email)
        .fetch_optional(pool)
        .await
}

async fn touch_email(pool: &PgPool, id: &str, provider: Provider, email: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE passes SET provider = $2, email = $3 WHERE id = $1::uuid")
        .bind(id)
        .bind(provider.as_str())
        .bind(email)
        .execute(pool)
        .await?;
    Ok(())
}

async fn attach_subject(pool: &PgPool, id: &str, provider: Provider, subject: &str) -> Result<(), sqlx::Error> {
    let sql = match provider {
        Provider::Google => "UPDATE passes SET provider = $2, google_sub = $3 WHERE id = $1::uuid",
        Provider::Github => "UPDATE passes SET provider = $2, github_sub = $3 WHERE id = $1::uuid",
    };
    sqlx::query(sql).bind(id).bind(provider.as_str()).bind(subject).execute(pool).await?;
    Ok(())
}

async fn insert_pass(pool: &PgPool, provider: Provider, email: &str, subject: &str) -> Result<Pass, sqlx::Error> {
    let id = Uuid::new_v4();
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let stripe = format!("free:{id}");
    let sql = match provider {
        Provider::Google => "INSERT INTO passes (id, token, email, stripe_session_id, created_at, expires_at, letters_used, letter_quota, provider, google_sub) VALUES ($1, $2, $3, $4, now(), now() + interval '365 days', 0, 40, $5, $6)",
        Provider::Github => "INSERT INTO passes (id, token, email, stripe_session_id, created_at, expires_at, letters_used, letter_quota, provider, github_sub) VALUES ($1, $2, $3, $4, now(), now() + interval '365 days', 0, 40, $5, $6)",
    };
    sqlx::query(sql)
        .bind(id)
        .bind(&token)
        .bind(email)
        .bind(stripe)
        .bind(provider.as_str())
        .bind(subject)
        .execute(pool)
        .await?;
    reload(pool, &token).await
}

async fn reload(pool: &PgPool, token: &str) -> Result<Pass, sqlx::Error> {
    find_pass(pool, token).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn read_profile(pool: &PgPool, id: &str) -> Result<Profile, sqlx::Error> {
    let row = sqlx::query("SELECT data FROM profiles WHERE pass_id = $1::uuid")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row
        .and_then(|row| serde_json::from_value::<Profile>(row.get("data")).ok())
        .unwrap_or_default())
}

pub async fn write_profile(pool: &PgPool, id: &str, profile: &Profile) -> Result<(), sqlx::Error> {
    let mut saved = profile.clone();
    saved.gemini_key.clear();
    let data = serde_json::to_value(&saved).unwrap_or(serde_json::json!({}));
    sqlx::query(
        "INSERT INTO profiles (pass_id, data) VALUES ($1::uuid, $2) ON CONFLICT (pass_id) DO UPDATE SET data = EXCLUDED.data",
    )
    .bind(id)
    .bind(data)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn read_tracker(pool: &PgPool, id: &str) -> Result<Vec<Tracked>, sqlx::Error> {
    let row = sqlx::query("SELECT data FROM trackers WHERE pass_id = $1::uuid")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    let Some(row) = row else { return Ok(Vec::new()); };
    let value: serde_json::Value = row.get("data");
    let map = value.as_object().cloned().unwrap_or_default();
    let mut items = Vec::new();
    for (_id, item) in map {
        if let Ok(tracked) = serde_json::from_value::<Tracked>(item) {
            items.push(tracked);
        }
    }
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(items)
}

pub async fn write_tracked(pool: &PgPool, pass_id: &str, tracked: &Tracked) -> Result<(), sqlx::Error> {
    let mut items = read_tracker(pool, pass_id).await?;
    items.retain(|item| item.id != tracked.id);
    items.push(tracked.clone());
    let mut map = serde_json::Map::new();
    for item in items {
        map.insert(item.id.clone(), serde_json::to_value(&item).unwrap_or(serde_json::json!({})));
    }
    sqlx::query(
        "INSERT INTO trackers (pass_id, data) VALUES ($1::uuid, $2) ON CONFLICT (pass_id) DO UPDATE SET data = EXCLUDED.data",
    )
    .bind(pass_id)
    .bind(serde_json::Value::Object(map))
    .execute(pool)
    .await?;
    Ok(())
}
