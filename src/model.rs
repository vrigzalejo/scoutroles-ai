use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub title: String,
    pub company: String,
    pub location: String,
    pub remote: bool,
    pub salary: String,
    pub description: String,
    pub tags: Vec<String>,
    pub url: String,
    pub apply_url: String,
    pub source: String,
    pub source_home: String,
    pub published_at: String,
}

#[derive(Clone, Debug)]
pub struct Scored {
    pub job: Job,
    pub score: i32,
    pub matched: Vec<String>,
    pub missing: Vec<String>,
    pub reasons: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub roles: String,
    #[serde(default)]
    pub location: String,
    #[serde(default = "remote_default")]
    pub remote_only: bool,
    #[serde(default)]
    pub resume: String,
    #[serde(default)]
    pub gemini_key: String,
}

fn remote_default() -> bool {
    true
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            name: String::new(),
            roles: String::new(),
            location: String::new(),
            remote_only: true,
            resume: String::new(),
            gemini_key: String::new(),
        }
    }
}

impl Profile {
    pub fn sample() -> Self {
        Self {
            name: "Alex Rivera".into(),
            roles: "frontend engineer".into(),
            location: "remote".into(),
            remote_only: true,
            resume: "Alex Rivera\nSan Francisco, CA · remote\nalex.rivera@example.com\n\nFrontend engineer. I build React and Next.js products, and I write the TypeScript around them.\n\nExperience\nSenior Frontend Engineer, Northwind Labs — 2022 to present\n- Shipped a Next.js dashboard in TypeScript and React\n- Built a design system in Tailwind, with accessibility fixes\n- Partnered with product and design in Figma and shipped weekly\n\nSoftware Engineer, Harbor — 2019 to 2022\n- React interfaces and Python services for a logistics tool\n- PostgreSQL, Node.js, and AWS\n\nSkills\nTypeScript, JavaScript, React, Next.js, Node.js, Python, PostgreSQL, AWS, Figma, CSS, HTML, REST, Tailwind, Docker\n".into(),
            gemini_key: String::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tracked {
    pub id: String,
    pub title: String,
    pub company: String,
    pub location: String,
    pub url: String,
    pub apply_url: String,
    pub source: String,
    pub source_home: String,
    pub salary: String,
    pub description: String,
    pub score: i32,
    pub matched: Vec<String>,
    pub missing: Vec<String>,
    pub reasons: Vec<String>,
    pub status: String,
    pub letter: String,
    pub tailored: String,
    pub note: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct SourceReport {
    pub name: String,
    pub home: String,
    pub count: usize,
    pub ok: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    Google,
    Github,
}

impl Provider {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "google" => Some(Self::Google),
            "github" => Some(Self::Github),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::Github => "github",
        }
    }
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Pass {
    pub id: String,
    pub token: String,
    pub email: String,
    pub provider: Option<String>,
}
