use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use crate::model::{Job, Profile, Scored};
use crate::text::join;

const SKILLS: &[&str] = &[
    "TypeScript", "JavaScript", "React", "React Native", "Next.js", "Node.js", "Vue", "Angular", "Svelte",
    "HTML", "CSS", "Tailwind", "Python", "Django", "Flask", "FastAPI", "Java", "Kotlin", "Spring", "Go",
    "Golang", "Rust", "Ruby", "Rails", "PHP", "Laravel", "C#", ".NET", "C++", "Swift", "iOS", "Android",
    "Flutter", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST", "AWS", "GCP", "Azure",
    "Docker", "Kubernetes", "Terraform", "Linux", "Snowflake", "Airflow", "dbt", "Spark", "Kafka", "Tableau",
    "Power BI", "Excel", "Looker", "Figma", "Sketch", "Adobe", "Photoshop", "Illustrator", "UI", "UX",
    "Accessibility", "SEO", "SEM", "Google Analytics", "Copywriting", "Content", "Editing", "Writing",
    "Salesforce", "HubSpot", "CRM", "Sales", "Marketing", "Design", "Product", "Research", "Analytics",
    "Experimentation", "A/B testing", "Project management", "Operations", "Recruiting", "Customer support",
    "Customer success", "Account management", "Bookkeeping", "Accounting", "QuickBooks", "Finance",
    "Financial modeling", "Pandas", "NumPy", "Machine learning", "LLM", "NLP", "PyTorch", "TensorFlow",
    "scikit-learn", "Data analysis", "Data engineering", "Data science", "Statistics", "R", "AI", "ML", "QA",
    "Cypress", "Playwright", "Jest", "CI/CD", "GitHub Actions", "Microservices", "System design", "Security",
    "OAuth", "SAP", "Workday", "HR", "PM", "BI", "Video editing", "YouTube", "Social media", "Shopify",
    "WordPress", "Illustration", "Photography", "Training", "Support", "Nursing", "Healthcare", "Teaching",
];

const SHORT: &[&str] = &["go", "c", "r", "sql", "sap", "aws", "gcp", "ui", "ux", "seo", "sem", "qa", "bi", "ml", "ai", "pm", "hr", "rest"];
const BROAD: &[&str] = &[
    "sales", "marketing", "design", "writing", "support", "finance", "recruiting", "research", "training",
    "editing", "analytics", "operations", "content", "product", "security", "healthcare", "teaching", "nursing",
];
const LIGHT: &[&str] = &["html", "css", "javascript", "design", "rest", "support", "writing", "content"];
const STOP: &[&str] = &["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "at", "by", "from", "remote", "job", "jobs", "role", "roles", "position", "end"];
const LEVEL: &[&str] = &["senior", "junior", "jr", "sr", "lead", "staff", "principal", "head", "chief", "mid", "entry", "level", "i", "ii", "iii", "iv", "associate", "intern", "internship"];
const ROLE_NOUNS: &[&str] = &["engineer", "developer", "designer", "manager", "analyst", "writer", "marketer", "scientist", "researcher", "recruiter", "specialist", "consultant", "architect", "accountant", "coordinator", "producer", "editor", "strategist", "representative", "administrator", "technician", "director", "product"];

static PATTERNS: LazyLock<HashMap<String, Regex>> = LazyLock::new(|| {
    SKILLS
        .iter()
        .map(|skill| {
            let key = skill.to_lowercase();
            let pattern = Regex::new(&format!(r"(?i)(?:^|[^a-z0-9]){}(?:[^a-z0-9]|$)", regex::escape(&key))).expect("skill pattern");
            (key, pattern)
        })
        .collect()
});

fn has_skill(haystack: &str, skill: &str) -> bool {
    PATTERNS.get(&skill.to_lowercase()).is_some_and(|pattern| pattern.is_match(haystack))
}

fn haystack(skill: &str, head: &str, full: &str) -> String {
    let key = skill.to_lowercase();
    if SHORT.contains(&key.as_str()) || BROAD.contains(&key.as_str()) {
        head.to_string()
    } else {
        full.to_string()
    }
}

fn weight(skill: &str) -> f64 {
    if LIGHT.contains(&skill.to_lowercase().as_str()) { 0.3 } else { 1.0 }
}

fn tokens(value: &str) -> Vec<String> {
    let normalized = value
        .to_lowercase()
        .replace("front-end", "frontend")
        .replace("front end", "frontend")
        .replace("back-end", "backend")
        .replace("back end", "backend")
        .replace("full-stack", "fullstack")
        .replace("full stack", "fullstack");
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for token in normalized.split(|ch: char| !ch.is_ascii_alphanumeric() && ch != '+' && ch != '#') {
        if token.len() < 2 || STOP.contains(&token) || LEVEL.contains(&token) || !seen.insert(token.to_string()) {
            continue;
        }
        result.push(token.to_string());
    }
    result
}

fn synonyms(token: &str) -> Vec<&str> {
    match token {
        "engineer" => vec!["engineer", "developer", "dev"],
        "developer" => vec!["developer", "engineer"],
        "designer" => vec!["designer", "design"],
        "writer" => vec!["writer", "copywriter"],
        "copywriter" => vec!["copywriter", "writer"],
        "marketer" => vec!["marketer", "marketing"],
        "marketing" => vec!["marketing", "marketer"],
        "salesperson" => vec!["salesperson", "sales"],
        "sales" => vec!["sales", "salesperson"],
        "analyst" => vec!["analyst", "analytics"],
        "recruiter" => vec!["recruiter", "recruiting"],
        _ => vec![],
    }
}

fn by_weight(skills: Vec<String>) -> Vec<String> {
    let order: HashMap<_, _> = SKILLS.iter().enumerate().map(|(index, skill)| (skill.to_lowercase(), index)).collect();
    let mut skills = skills;
    skills.sort_by(|a, b| {
        weight(b).partial_cmp(&weight(a)).unwrap_or(std::cmp::Ordering::Equal).then_with(|| {
            order.get(&a.to_lowercase()).unwrap_or(&999).cmp(&order.get(&b.to_lowercase()).unwrap_or(&999))
        })
    });
    skills
}

fn collapse(found: Vec<String>) -> Vec<String> {
    let mut sorted = found;
    sorted.sort_by_key(|skill| std::cmp::Reverse(skill.len()));
    let mut kept = Vec::new();
    for skill in sorted {
        let lower = skill.to_lowercase();
        if kept.iter().any(|item: &String| item.to_lowercase().contains(&lower)) {
            continue;
        }
        kept.push(skill);
    }
    kept.sort();
    kept
}

pub fn score_jobs(jobs: Vec<Job>, profile: &Profile) -> Vec<Scored> {
    let mut scored: Vec<Scored> = jobs.into_iter().map(|job| score_job(job, profile)).collect();
    scored.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| b.job.published_at.cmp(&a.job.published_at)));
    scored
}

fn score_job(job: Job, profile: &Profile) -> Scored {
    let roles: Vec<String> = profile
        .roles
        .split([',', '\n'])
        .map(str::trim)
        .filter(|role| !role.is_empty())
        .map(str::to_string)
        .collect();
    let role_list = if roles.is_empty() { infer_roles(&profile.resume) } else { roles };
    let resume_skills: Vec<String> = SKILLS.iter().filter(|skill| has_skill(&profile.resume, skill)).map(|skill| (*skill).to_string()).collect();
    let head = format!("{}\n{}", job.title, job.tags.join(" "));
    let full = format!("{head}\n{}", job.description);
    let matched = by_weight(collapse(
        resume_skills.iter().filter(|skill| has_skill(&haystack(skill, &head, &full), skill)).cloned().collect(),
    ));
    let missing: Vec<String> = collapse(
        SKILLS
            .iter()
            .filter(|skill| has_skill(&haystack(skill, &head, &head), skill) && !has_skill(&profile.resume, skill))
            .map(|skill| (*skill).to_string())
            .collect(),
    )
    .into_iter()
    .take(5)
    .collect();

    if resume_skills.is_empty() && role_list.is_empty() {
        return Scored {
            job,
            score: 0,
            matched,
            missing,
            reasons: vec!["Add a resume or a target role and this list will sort itself.".into()],
        };
    }

    let fit = title_fit(&role_list, &job.title);
    let weight_sum: f64 = matched.iter().map(|skill| weight(skill)).sum();
    let resume_weight: f64 = resume_skills.iter().map(|skill| weight(skill)).sum();
    let coverage = if resume_weight > 0.0 { (weight_sum / resume_weight.min(6.0)).min(1.0) } else { 0.0 };
    let named = matched.iter().filter(|skill| weight(skill) == 1.0 && has_skill(&job.title, skill)).count();
    let mut score = coverage * 58.0 + fit * 34.0 + weight_sum.min(6.0) * 1.4 + (named.min(3) as f64) * 5.0;
    let mut reasons = Vec::new();
    if location_hit(&profile.location, &job) {
        score += 6.0;
        reasons.push(format!("Location lines up with {}.", profile.location.trim()));
    }
    if job.remote {
        reasons.push("Remote role.".into());
    }
    if !matched.is_empty() {
        reasons.insert(0, format!("Overlaps on {}.", join(&matched.iter().take(4).cloned().collect::<Vec<_>>())));
    } else if !profile.resume.trim().is_empty() {
        reasons.insert(0, "Little skill overlap with your resume.".into());
    }
    if fit >= 0.5 && !role_list.is_empty() {
        let at = if reasons.is_empty() { 0 } else { 1 };
        reasons.insert(at, format!("Title fits {}.", role_list[0]));
    }
    if !missing.is_empty() {
        reasons.push(format!("Posting also asks for {}.", missing.iter().take(3).cloned().collect::<Vec<_>>().join(", ")));
    }
    Scored {
        job,
        score: score.round().clamp(0.0, 96.0) as i32,
        matched,
        missing,
        reasons,
    }
}

fn infer_roles(resume: &str) -> Vec<String> {
    resume
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(40)
        .find(|line| line.len() < 90 && ROLE_NOUNS.iter().any(|noun| line.to_lowercase().contains(noun)))
        .map(|line| vec![line.to_string()])
        .unwrap_or_default()
}

fn title_fit(roles: &[String], title: &str) -> f64 {
    let wanted: Vec<String> = roles.iter().flat_map(|role| tokens(role)).collect();
    if wanted.is_empty() {
        return 0.0;
    }
    let title_tokens: HashSet<String> = tokens(title).into_iter().collect();
    let generic = HashSet::from(["engineer", "developer", "dev", "manager"]);
    let mut hits = 0.0;
    for token in &wanted {
        let options = synonyms(token);
        let options = if options.is_empty() { vec![token.as_str()] } else { options };
        if !options.iter().any(|option| title_tokens.contains(*option)) {
            continue;
        }
        hits += if generic.contains(token.as_str()) { 0.35 } else { 1.0 };
    }
    hits / wanted.len() as f64
}

fn location_hit(location: &str, job: &Job) -> bool {
    let parts: Vec<String> = location
        .split([',', '/', '|'])
        .map(|part| part.trim().to_lowercase())
        .filter(|part| part.len() > 2 && part != "remote" && part != "anywhere")
        .collect();
    if parts.is_empty() {
        return false;
    }
    let blob = format!("{} {}", job.location, job.title).to_lowercase();
    parts.iter().any(|part| blob.contains(part))
}
