import { SKILLS, skillHaystack } from "@/lib/skills";
import { joinList } from "@/lib/text";
import type { Job, Profile, ScoredJob } from "@/lib/types";

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "at",
  "by",
  "from",
  "remote",
  "job",
  "jobs",
  "role",
  "roles",
  "position",
  "end",
]);

const LEVEL = new Set([
  "senior",
  "junior",
  "jr",
  "sr",
  "lead",
  "staff",
  "principal",
  "head",
  "chief",
  "mid",
  "entry",
  "level",
  "i",
  "ii",
  "iii",
  "iv",
  "associate",
  "intern",
  "internship",
]);

const SYNONYMS: Record<string, string[]> = {
  engineer: ["engineer", "developer", "dev"],
  developer: ["developer", "engineer"],
  designer: ["designer", "design"],
  writer: ["writer", "copywriter"],
  copywriter: ["copywriter", "writer"],
  marketer: ["marketer", "marketing"],
  marketing: ["marketing", "marketer"],
  salesperson: ["salesperson", "sales"],
  sales: ["sales", "salesperson"],
  analyst: ["analyst", "analytics"],
  recruiter: ["recruiter", "recruiting"],
};

const LIGHT = new Set([
  "html",
  "css",
  "javascript",
  "design",
  "rest",
  "support",
  "writing",
  "content",
]);

function skillWeight(skill: string): number {
  return LIGHT.has(skill.toLowerCase()) ? 0.3 : 1;
}

function byWeight(skills: string[]): string[] {
  const order = new Map<string, number>(SKILLS.map((skill, index) => [skill, index]));
  return [...skills].sort(
    (a, b) => skillWeight(b) - skillWeight(a) || (order.get(a) ?? 999) - (order.get(b) ?? 999),
  );
}

const ROLE_NOUNS = [
  "engineer",
  "developer",
  "designer",
  "manager",
  "analyst",
  "writer",
  "marketer",
  "scientist",
  "researcher",
  "recruiter",
  "specialist",
  "consultant",
  "architect",
  "accountant",
  "coordinator",
  "producer",
  "editor",
  "strategist",
  "representative",
  "administrator",
  "technician",
  "director",
  "product",
];

const skillPattern = new Map<string, RegExp>();

function patternFor(skill: string): RegExp {
  const key = skill.toLowerCase();
  const cached = skillPattern.get(key);
  if (cached) return cached;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
  skillPattern.set(key, pattern);
  return pattern;
}

export function hasSkill(haystack: string, skill: string): boolean {
  return patternFor(skill).test(haystack);
}

export function tokens(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/front[\s-]?end/g, "frontend")
    .replace(/back[\s-]?end/g, "backend")
    .replace(/full[\s-]?stack/g, "fullstack");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of normalized.split(/[^a-z0-9+#]+/)) {
    if (token.length < 2 || STOP.has(token) || LEVEL.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }
  return result;
}

function inferRoles(resume: string): string[] {
  const lines = resume
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
  const hit = lines.find(
    (line) =>
      line.length < 90 &&
      ROLE_NOUNS.some((noun) => line.toLowerCase().includes(noun)),
  );
  return hit ? [hit] : [];
}

function titleFit(roles: string[], title: string): number {
  const wanted = roles.flatMap((role) => tokens(role));
  if (!wanted.length) return 0;
  const titleTokens = new Set(tokens(title));
  const generic = new Set(["engineer", "developer", "dev", "manager"]);
  let hits = 0;
  for (const token of wanted) {
    const options = SYNONYMS[token] ?? [token];
    if (!options.some((option) => titleTokens.has(option))) continue;
    hits += generic.has(token) ? 0.35 : 1;
  }
  return hits / wanted.length;
}

function collapse(found: string[]): string[] {
  const sorted = [...found].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const skill of sorted) {
    const lower = skill.toLowerCase();
    if (kept.some((item) => item.toLowerCase().includes(lower))) continue;
    kept.push(skill);
  }
  return kept.sort((a, b) => a.localeCompare(b));
}

function skillsIn(resume: string): string[] {
  return SKILLS.filter((skill) => hasSkill(resume, skill));
}

function locationHit(location: string, job: Job): boolean {
  const parts = location
    .split(/[,/|]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 2 && part !== "remote" && part !== "anywhere");
  if (!parts.length) return false;
  const blob = `${job.location} ${job.title}`.toLowerCase();
  return parts.some((part) => blob.includes(part));
}

export function scoreJob(job: Job, profile: Profile): ScoredJob {
  const resume = profile.resume;
  const roles = profile.roles
    .split(/[\n,]/)
    .map((role) => role.trim())
    .filter(Boolean);
  const roleList = roles.length ? roles : inferRoles(resume);
  const resumeSkills = skillsIn(resume);
  const head = `${job.title}\n${job.tags.join(" ")}`;
  const full = `${head}\n${job.description}`;

  const matched = byWeight(
    collapse(resumeSkills.filter((skill) => hasSkill(skillHaystack(skill, head, full), skill))),
  );
  const missing = collapse(
    SKILLS.filter(
      (skill) => hasSkill(skillHaystack(skill, head, head), skill) && !hasSkill(resume, skill),
    ),
  ).slice(0, 5);

  const fit = titleFit(roleList, job.title);
  const highlight = byWeight(matched);
  const namedInTitle = highlight.filter(
    (skill) => skillWeight(skill) === 1 && hasSkill(job.title, skill),
  );
  const reasons: string[] = [];

  if (!resumeSkills.length && !roleList.length) {
    return {
      job,
      score: 0,
      matched,
      missing,
      reasons: ["Add a resume or a target role and this list will sort itself."],
    };
  }

  const weightSum = matched.reduce((sum, skill) => sum + skillWeight(skill), 0);
  const resumeWeight = resumeSkills.reduce((sum, skill) => sum + skillWeight(skill), 0);
  const coverage = resumeWeight ? Math.min(1, weightSum / Math.min(resumeWeight, 6)) : 0;

  let score = coverage * 58 + fit * 34 + Math.min(weightSum, 6) * 1.4;
  score += Math.min(namedInTitle.length, 3) * 5;
  if (locationHit(profile.location, job)) {
    score += 6;
    reasons.push(`Location lines up with ${profile.location.trim()}.`);
  }
  if (job.remote) reasons.push("Remote role.");

  if (highlight.length) {
    reasons.unshift(`Overlaps on ${joinList(highlight.slice(0, 4))}.`);
  } else if (resume.trim()) {
    reasons.unshift("Little skill overlap with your resume.");
  }

  if (fit >= 0.5 && roleList.length) {
    reasons.splice(1, 0, `Title fits ${roleList[0]}.`);
  }

  if (missing.length) {
    reasons.push(`Posting also asks for ${missing.slice(0, 3).join(", ")}.`);
  }

  return {
    job,
    score: Math.max(0, Math.min(96, Math.round(score))),
    matched,
    missing,
    reasons,
  };
}

export function scorePreparedResume(job: Job, profile: Profile, prepared: string): ScoredJob {
  const base = scoreJob(job, profile);
  const opening = prepared
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
  const lead = base.matched.filter((skill) => hasSkill(opening, skill));
  const reasons = lead.length
    ? [`The document leads with ${joinList(lead.slice(0, 4))}.`, ...base.reasons]
    : base.reasons;
  return {
    ...base,
    score: Math.min(96, base.score + Math.min(12, lead.length * 3)),
    reasons,
  };
}

export function scoreJobs(jobs: Job[], profile: Profile): ScoredJob[] {
  return jobs
    .map((job) => scoreJob(job, profile))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.job.publishedAt || "0") - Date.parse(a.job.publishedAt || "0");
    });
}
