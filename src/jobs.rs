use std::collections::HashMap;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde_json::Value;
use tokio::sync::Mutex;

use crate::model::{Job, SourceReport};

const UA: &str = "ScoutRoles/0.1 (personal job search; links back to each source)";

pub struct JobCache {
    inner: Mutex<Option<(Instant, Vec<Job>, Vec<SourceReport>, bool)>>,
}

impl JobCache {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub async fn load(&self, http: &Client, force: bool) -> (Vec<Job>, Vec<SourceReport>, bool) {
        let mut guard = self.inner.lock().await;
        if !force {
            if let Some((at, jobs, reports, sample)) = guard.as_ref() {
                if at.elapsed() < Duration::from_secs(15 * 60) {
                    return (jobs.clone(), reports.clone(), *sample);
                }
            }
        }
        let (jobs, reports, sample) = fetch_all(http).await;
        *guard = Some((Instant::now(), jobs.clone(), reports.clone(), sample));
        (jobs, reports, sample)
    }
}

async fn fetch_all(http: &Client) -> (Vec<Job>, Vec<SourceReport>, bool) {
    let (remotive, remote_ok, jobicy, arbeitnow, himalayas) = tokio::join!(
        source(http, "Remotive", "https://remotive.com", remotive),
        source(http, "Remote OK", "https://remoteok.com", remote_ok),
        source(http, "Jobicy", "https://jobicy.com", jobicy),
        source(http, "Arbeitnow", "https://www.arbeitnow.com", arbeitnow),
        source(http, "Himalayas", "https://himalayas.app", himalayas),
    );
    let batches = [remotive, remote_ok, jobicy, arbeitnow, himalayas];
    let jobs = dedupe(batches.iter().flat_map(|batch| batch.0.clone()).collect());
    let reports = batches.into_iter().map(|batch| batch.1).collect();
    if jobs.is_empty() {
        return (sample_jobs(), reports, true);
    }
    (jobs, reports, false)
}

async fn source<F, Fut>(http: &Client, name: &str, home: &str, run: F) -> (Vec<Job>, SourceReport)
where
    F: FnOnce(Client) -> Fut,
    Fut: std::future::Future<Output = Result<Vec<Job>, String>>,
{
    let report = |ok: bool, count: usize| SourceReport { name: name.into(), home: home.into(), count, ok };
    match tokio::time::timeout(Duration::from_secs(12), run(http.clone())).await {
        Ok(Ok(jobs)) => {
            let count = jobs.len();
            (jobs, report(true, count))
        }
        _ => (Vec::new(), report(false, 0)),
    }
}

async fn get_json(http: &Client, url: &str) -> Result<Value, String> {
    let response = http
        .get(url)
        .header("user-agent", UA)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(response.status().to_string());
    }
    response.json().await.map_err(|error| error.to_string())
}

fn text(value: &Value) -> String {
    match value {
        Value::String(item) => item.clone(),
        Value::Number(item) => item.to_string(),
        _ => String::new(),
    }
}

fn http_url(value: &Value) -> String {
    let url = text(value).trim().to_string();
    if url.starts_with("http") { url } else { String::new() }
}

fn plain(value: &Value) -> String {
    let raw = text(value);
    let stripped = regex::Regex::new(r"<[^>]+>").unwrap().replace_all(&raw, " ");
    let compact = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() > 2200 {
        format!("{}…", compact.chars().take(2200).collect::<String>().trim())
    } else {
        compact
    }
}

fn tags(value: &Value) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut clean = Vec::new();
    let items: Vec<String> = match value {
        Value::Array(items) => items.iter().filter_map(|item| item.as_str().map(str::to_string)).collect(),
        Value::String(item) => item.split(',').map(|part| part.trim().to_string()).collect(),
        _ => Vec::new(),
    };
    for item in items {
        let key = item.to_lowercase();
        if item.is_empty() || item.len() > 40 || !seen.insert(key) {
            continue;
        }
        clean.push(item);
        if clean.len() == 12 {
            break;
        }
    }
    clean
}

use std::collections::HashSet;

fn make_job(source: &str, home: &str, id: String, title: String, company: String, location: String, remote: bool, salary: String, description: String, tags: Vec<String>, url: String, apply_url: String, published_at: String) -> Option<Job> {
    let title = title.trim().to_string();
    let url = if url.is_empty() { apply_url.clone() } else { url };
    if title.is_empty() || url.is_empty() {
        return None;
    }
    Some(Job {
        id: format!("{source}:{id}"),
        title,
        company: if company.trim().is_empty() { "Unknown company".into() } else { company.trim().to_string() },
        location: if location.trim().is_empty() && remote { "Remote".into() } else { location.trim().to_string() },
        remote,
        salary: salary.trim().to_string(),
        description,
        tags,
        apply_url: if apply_url.is_empty() { url.clone() } else { apply_url },
        url,
        source: source.into(),
        source_home: home.into(),
        published_at,
    })
}

async fn remotive(http: Client) -> Result<Vec<Job>, String> {
    let payload = get_json(&http, "https://remotive.com/api/remote-jobs").await?;
    Ok(list(&payload, "jobs").filter_map(|row| {
        make_job(
            "Remotive",
            "https://remotive.com",
            text(&row["id"]),
            text(&row["title"]),
            text(&row["company_name"]),
            text(&row["candidate_required_location"]),
            true,
            text(&row["salary"]),
            plain(&row["description"]),
            tags(&row["tags"]),
            http_url(&row["url"]),
            http_url(&row["url"]),
            text(&row["publication_date"]),
        )
    }).collect())
}

async fn remote_ok(http: Client) -> Result<Vec<Job>, String> {
    let payload = get_json(&http, "https://remoteok.com/api").await?;
    let Some(rows) = payload.as_array() else { return Ok(Vec::new()); };
    Ok(rows.iter().filter_map(|row| {
        if text(&row["position"]).is_empty() {
            return None;
        }
        let listing = http_url(&row["url"]);
        let apply = http_url(&row["apply_url"]);
        make_job(
            "Remote OK",
            "https://remoteok.com",
            text(&row["id"]),
            text(&row["position"]),
            text(&row["company"]),
            if text(&row["location"]).is_empty() { "Remote".into() } else { text(&row["location"]) },
            true,
            String::new(),
            plain(&row["description"]),
            tags(&row["tags"]),
            if listing.is_empty() { apply.clone() } else { listing.clone() },
            if apply.is_empty() { listing } else { apply },
            text(&row["date"]),
        )
    }).collect())
}

async fn jobicy(http: Client) -> Result<Vec<Job>, String> {
    let payload = get_json(&http, "https://jobicy.com/api/v2/remote-jobs?count=50").await?;
    Ok(list(&payload, "jobs").filter_map(|row| {
        make_job(
            "Jobicy",
            "https://jobicy.com",
            text(&row["id"]),
            text(&row["jobTitle"]),
            text(&row["companyName"]),
            if text(&row["jobGeo"]).is_empty() { "Remote".into() } else { text(&row["jobGeo"]) },
            true,
            String::new(),
            plain(&row["jobDescription"]),
            tags(&row["jobIndustry"]),
            http_url(&row["url"]),
            http_url(&row["url"]),
            text(&row["pubDate"]),
        )
    }).collect())
}

async fn arbeitnow(http: Client) -> Result<Vec<Job>, String> {
    let payload = get_json(&http, "https://www.arbeitnow.com/api/job-board-api").await?;
    Ok(list(&payload, "data").filter_map(|row| {
        let remote = row["remote"].as_bool().unwrap_or(false);
        make_job(
            "Arbeitnow",
            "https://www.arbeitnow.com",
            text(&row["slug"]),
            text(&row["title"]),
            text(&row["company_name"]),
            text(&row["location"]),
            remote,
            String::new(),
            plain(&row["description"]),
            tags(&row["tags"]),
            http_url(&row["url"]),
            http_url(&row["url"]),
            text(&row["created_at"]),
        )
    }).collect())
}

async fn himalayas(http: Client) -> Result<Vec<Job>, String> {
    let payload = get_json(&http, "https://himalayas.app/jobs/api?limit=20").await?;
    Ok(list(&payload, "jobs").filter_map(|row| {
        let listing = {
            let guid = http_url(&row["guid"]);
            if guid.is_empty() { http_url(&row["applicationLink"]) } else { guid }
        };
        let location = row["locationRestrictions"].as_array().map(|items| {
            items.iter().filter_map(|item| item.as_str()).collect::<Vec<_>>().join(", ")
        }).unwrap_or_default();
        make_job(
            "Himalayas",
            "https://himalayas.app",
            if listing.is_empty() { text(&row["title"]) } else { listing.clone() },
            text(&row["title"]),
            text(&row["companyName"]),
            if location.is_empty() { "Remote".into() } else { location },
            true,
            String::new(),
            plain(&row["description"]),
            tags(&row["parentCategories"]),
            listing.clone(),
            {
                let apply = http_url(&row["applicationLink"]);
                if apply.is_empty() { listing } else { apply }
            },
            text(&row["pubDate"]),
        )
    }).collect())
}

fn list<'a>(payload: &'a Value, key: &str) -> impl Iterator<Item = &'a Value> {
    payload.get(key).and_then(Value::as_array).into_iter().flatten()
}

fn dedupe(jobs: Vec<Job>) -> Vec<Job> {
    let mut map = HashMap::new();
    for job in jobs {
        let key = format!(
            "{}|{}",
            job.company.to_lowercase().chars().filter(|ch| ch.is_ascii_alphanumeric()).collect::<String>(),
            job.title.to_lowercase().chars().filter(|ch| ch.is_ascii_alphanumeric()).collect::<String>()
        );
        let replace = map.get(&key).is_none_or(|previous: &Job| job.description.len() > previous.description.len());
        if replace {
            map.insert(key, job);
        }
    }
    let mut jobs: Vec<Job> = map.into_values().collect();
    jobs.sort_by(|a, b| b.published_at.cmp(&a.published_at));
    jobs
}

fn sample_jobs() -> Vec<Job> {
    vec![
        sample("sample:1", "Senior Frontend Engineer", "Sample Studio", "Remote, North America", "$150k-$180k", "Build the product in React, Next.js, and TypeScript. You will work with design in Figma. PostgreSQL and Node.js sit behind the app.", &["React", "TypeScript", "Next.js", "Figma"], "https://remotive.com"),
        sample("sample:2", "Product Designer", "Sample Atelier", "Remote", "$120k-$145k", "Own product design in Figma. You partner with frontend engineers and care about accessibility.", &["Figma", "UI", "UX"], "https://remoteok.com"),
        sample("sample:3", "Full Stack Engineer", "Sample Harbor", "Remote", "$130k-$160k", "TypeScript, React, Node.js, and PostgreSQL. Docker and AWS in production.", &["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"], "https://jobicy.com"),
    ]
}

fn sample(id: &str, title: &str, company: &str, location: &str, salary: &str, description: &str, tags: &[&str], home: &str) -> Job {
    Job {
        id: id.into(),
        title: title.into(),
        company: company.into(),
        location: location.into(),
        remote: true,
        salary: salary.into(),
        description: description.into(),
        tags: tags.iter().map(|tag| (*tag).to_string()).collect(),
        url: home.into(),
        apply_url: home.into(),
        source: "Sample".into(),
        source_home: home.into(),
        published_at: String::new(),
    }
}
