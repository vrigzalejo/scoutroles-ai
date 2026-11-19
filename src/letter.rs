use crate::model::{Profile, Scored};
use crate::text::join;

pub fn local_letter(profile: &Profile, scored: &Scored) -> String {
    let name = if profile.name.trim().is_empty() { first_line(&profile.resume) } else { profile.name.trim().to_string() };
    let skills: Vec<String> = scored.matched.iter().take(4).cloned().collect();
    let overlap = if skills.is_empty() {
        "I would be glad to talk through how my background fits the work.".into()
    } else {
        format!("I would be glad to talk through my experience with {}.", join(&skills))
    };
    let mut lines = vec![
        format!("Dear {} team,", scored.job.company),
        String::new(),
        format!("Thank you for considering my application for the {} role. {overlap}", scored.job.title),
        String::new(),
        if profile.resume.trim().is_empty() {
            "I would be happy to send a resume and a few examples of related work.".into()
        } else {
            "I have kept this note brief so it is easy to read. The details are on my resume, and I would welcome the chance to walk through the relevant work with you.".into()
        },
        String::new(),
        "Thank you again for your time and consideration.".into(),
        "Sincerely,".into(),
    ];
    if !name.is_empty() {
        lines.push(name);
    }
    lines.join("\n")
}

fn first_line(resume: &str) -> String {
    resume.lines().map(str::trim).find(|line| !line.is_empty()).unwrap_or("").to_string()
}
