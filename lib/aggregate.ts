import { htmlToText } from "@/lib/text";
import type { Job, JobSource, JobsPayload, SourceReport } from "@/lib/types";

const UA = "ScoutRoles/0.1 (personal job search; links back to each source)";
const TTL = 15 * 60 * 1000;

const HOMES: Record<Exclude<JobSource, "Sample">, string> = {
  Remotive: "https://remotive.com",
  "Remote OK": "https://remoteok.com",
  Jobicy: "https://jobicy.com",
  Arbeitnow: "https://www.arbeitnow.com",
  "Arbeitnow UK": "https://www.arbeitnow.co.uk",
  "Working Nomads": "https://www.workingnomads.com",
  Himalayas: "https://himalayas.app",
  "We Work Remotely": "https://weworkremotely.com",
  "DevIT Jobs": "https://devitjobs.uk",
  "Landing.jobs": "https://landing.jobs",
  "Startup Jobs": "https://startup.jobs",
  "Get on Board": "https://www.getonbrd.com",
  Dribbble: "https://dribbble.com",
  "Python.org": "https://www.python.org/jobs/",
  Greenhouse: "https://www.greenhouse.com",
  Lever: "https://www.lever.co",
  Ashby: "https://www.ashbyhq.com",
};

let cache: { at: number; payload: JobsPayload } | null = null;

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function http(value: unknown): string {
  const url = str(value).trim();
  return url.startsWith("http") ? url : "";
}

function iso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  return "";
}

function tagsOf(...parts: unknown[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const part of parts) {
    const items = Array.isArray(part)
      ? part.filter((item): item is string => typeof item === "string")
      : typeof part === "string"
        ? part.split(",")
        : [];
    for (const item of items) {
      const value = item.trim();
      const key = value.toLowerCase();
      if (!value || value.length > 40 || seen.has(key)) continue;
      seen.add(key);
      clean.push(value);
      if (clean.length === 16) return clean;
    }
  }
  return clean;
}

function plain(value: unknown): string {
  const text = htmlToText(str(value));
  return text.length > 2200 ? `${text.slice(0, 2200).trim()}…` : text;
}

function money(min: unknown, max: unknown): string {
  const low = Number(min) || 0;
  const high = Number(max) || 0;
  if (low <= 0 && high <= 0) return "";
  const fmt = (amount: number) =>
    amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${Math.round(amount)}`;
  if (low > 0 && high > 0 && low !== high) return `${fmt(Math.min(low, high))}-${fmt(Math.max(low, high))}`;
  return fmt(low || high);
}

function job(input: {
  source: Exclude<JobSource, "Sample">;
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string;
  description: string;
  tags: string[];
  url: string;
  applyUrl: string;
  publishedAt: string;
}): Job | null {
  const title = input.title.trim();
  const url = input.url || input.applyUrl;
  if (!title || !url) return null;
  return {
    id: `${input.source}:${input.id || url}`,
    title,
    company: input.company.trim() || "Unknown company",
    location: input.location.trim() || (input.remote ? "Remote" : ""),
    remote: input.remote,
    salary: input.salary.trim(),
    description: input.description,
    tags: input.tags,
    url,
    applyUrl: input.applyUrl || url,
    source: input.source,
    sourceHome: HOMES[input.source],
    publishedAt: input.publishedAt,
  };
}

async function pull(url: string, accept = "application/json"): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": UA,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(String(response.status));
  if (accept.includes("xml") || accept.includes("rss")) return response.text();
  return response.json();
}

function rssItems(xml: string): { title: string; link: string; description: string; pubDate: string; region: string; category: string }[] {
  const chunks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return chunks.map((chunk) => {
    const pick = (tag: string) => {
      const cdata = chunk.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i"));
      const raw = cdata?.[1] ?? chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? "";
      return raw
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();
    };
    return {
      title: pick("title"),
      link: pick("link"),
      description: pick("description"),
      pubDate: pick("pubDate"),
      region: pick("region"),
      category: pick("category"),
    };
  });
}

function explain(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timed out";
    return error.message.slice(0, 80);
  }
  return "failed";
}

async function fromSource(
  name: Exclude<JobSource, "Sample">,
  run: () => Promise<Job[]>,
): Promise<{ jobs: Job[]; report: SourceReport }> {
  try {
    const jobs = await run();
    return { jobs, report: { name, home: HOMES[name], count: jobs.length, ok: true } };
  } catch (error) {
    return {
      jobs: [],
      report: { name, home: HOMES[name], count: 0, ok: false, error: explain(error) },
    };
  }
}

async function remotive(): Promise<Job[]> {
  const payload = (await pull("https://remotive.com/api/remote-jobs")) as { jobs?: unknown[] };
  return (payload.jobs ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const next = job({
      source: "Remotive",
      id: str(row.id),
      title: str(row.title),
      company: str(row.company_name),
      location: str(row.candidate_required_location),
      remote: true,
      salary: str(row.salary),
      description: plain(row.description),
      tags: tagsOf(row.tags, row.category),
      url: http(row.url),
      applyUrl: http(row.url),
      publishedAt: iso(row.publication_date),
    });
    return next ? [next] : [];
  });
}

async function remoteOk(): Promise<Job[]> {
  const payload = (await pull("https://remoteok.com/api")) as unknown[];
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const row = item as Record<string, unknown>;
    if (!str(row.position)) return [];
    const listing = http(row.url);
    const apply = http(row.apply_url);
    const next = job({
      source: "Remote OK",
      id: str(row.id),
      title: str(row.position),
      company: str(row.company),
      location: str(row.location) || "Remote",
      remote: true,
      salary: money(row.salary_min, row.salary_max),
      description: plain(row.description),
      tags: tagsOf(row.tags),
      url: listing || apply,
      applyUrl: apply || listing,
      publishedAt: iso(row.date || row.epoch),
    });
    return next ? [next] : [];
  });
}

async function jobicy(): Promise<Job[]> {
  const payload = (await pull("https://jobicy.com/api/v2/remote-jobs?count=50")) as {
    jobs?: unknown[];
  };
  return (payload.jobs ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const next = job({
      source: "Jobicy",
      id: str(row.id),
      title: str(row.jobTitle),
      company: str(row.companyName),
      location: str(row.jobGeo) || "Remote",
      remote: true,
      salary: "",
      description: plain(row.jobDescription || row.jobExcerpt),
      tags: tagsOf(row.jobIndustry, row.jobType, row.jobLevel),
      url: http(row.url),
      applyUrl: http(row.url),
      publishedAt: iso(row.pubDate),
    });
    return next ? [next] : [];
  });
}

async function arbeitnowBoard(source: "Arbeitnow" | "Arbeitnow UK", url: string): Promise<Job[]> {
  const payload = (await pull(url)) as { data?: unknown[] };
  return (payload.data ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const remote = row.remote === true;
    const next = job({
      source,
      id: str(row.slug),
      title: str(row.title),
      company: str(row.company_name),
      location: str(row.location) || (remote ? "Remote" : ""),
      remote,
      salary: "",
      description: plain(row.description),
      tags: tagsOf(row.tags, row.job_types),
      url: http(row.url),
      applyUrl: http(row.url),
      publishedAt: iso(row.created_at),
    });
    return next ? [next] : [];
  });
}

async function himalayas(): Promise<Job[]> {
  const first = (await pull("https://himalayas.app/jobs/api?limit=20")) as {
    jobs?: unknown[];
    nextCursor?: string;
  };
  let second: { jobs?: unknown[] } = {};
  if (first.nextCursor) {
    try {
      second = (await pull(
        `https://himalayas.app/jobs/api?limit=20&cursor=${encodeURIComponent(first.nextCursor)}`,
      )) as { jobs?: unknown[] };
    } catch {
      second = {};
    }
  }
  return [first, second].flatMap((payload) => (payload.jobs ?? [])).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const listing = http(row.guid) || http(row.applicationLink);
    const restrictions = Array.isArray(row.locationRestrictions)
      ? row.locationRestrictions.filter((place): place is string => typeof place === "string")
      : [];
    const next = job({
      source: "Himalayas",
      id: listing || str(row.title),
      title: str(row.title),
      company: str(row.companyName),
      location: restrictions.join(", ") || "Remote",
      remote: true,
      salary: money(row.minSalary, row.maxSalary),
      description: plain(row.description || row.excerpt),
      tags: tagsOf(row.parentCategories, row.employmentType, row.seniority),
      url: listing,
      applyUrl: http(row.applicationLink) || listing,
      publishedAt: iso(row.pubDate),
    });
    return next ? [next] : [];
  });
}

const REMOTELY_FEEDS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-design-jobs.rss",
  "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
  "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
];

async function weWork(): Promise<Job[]> {
  const feeds = await Promise.allSettled(REMOTELY_FEEDS.map((url) => pull(url, "application/rss+xml")));
  const items = feeds.flatMap((result) =>
    result.status === "fulfilled" && typeof result.value === "string" ? rssItems(result.value) : [],
  );
  if (!items.length) throw new Error("no feeds");
  return items.flatMap((item) => {
    const split = item.title.indexOf(":");
    const company = split > 1 && split < 48 ? item.title.slice(0, split).trim() : "";
    const title = company ? item.title.slice(split + 1).trim() : item.title;
    const listing = http(item.link);
    const next = job({
      source: "We Work Remotely",
      id: listing || item.title,
      title,
      company: company || "We Work Remotely",
      location: item.region || "Remote",
      remote: true,
      salary: "",
      description: plain(item.description),
      tags: tagsOf(item.category),
      url: listing,
      applyUrl: listing,
      publishedAt: iso(item.pubDate),
    });
    return next ? [next] : [];
  });
}

function labeledSalary(low: unknown, high: unknown, currency = ""): string {
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : "";
  const start = Number(low) || 0;
  const end = Number(high) || 0;
  if (start <= 0 && end <= 0) return "";
  const fmt = (amount: number) => {
    if (amount >= 20000) return `${symbol}${Math.round(amount / 1000)}k`;
    return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
  };
  if (start > 0 && end > 0 && start !== end) return `${fmt(Math.min(start, end))}-${fmt(Math.max(start, end))}`;
  return fmt(start || end);
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function landingJobs(): Promise<Job[]> {
  const payload = (await pull("https://landing.jobs/api/v1/jobs")) as unknown[];
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const listing = http(row.url);
    const companySlug = listing.match(/landing\.jobs\/at\/([^/]+)/)?.[1] ?? "";
    const places = Array.isArray(row.locations) ? row.locations : [];
    const place = places
      .map((entry) => {
        const location = entry as Record<string, unknown>;
        return [str(location.city), str(location.country_code)].filter(Boolean).join(", ");
      })
      .filter(Boolean)
      .join(" · ");
    const next = job({
      source: "Landing.jobs",
      id: str(row.id) || listing,
      title: str(row.title),
      company: companySlug ? titleCaseSlug(companySlug) : "Landing.jobs",
      location: place || (row.remote === true ? "Remote" : ""),
      remote: row.remote === true,
      salary: labeledSalary(row.gross_salary_low, row.gross_salary_high, str(row.currency_code)),
      description: plain(
        [row.role_description, row.main_requirements, row.nice_to_have].map(str).filter(Boolean).join("\n"),
      ),
      tags: tagsOf(row.tags, row.type),
      url: listing,
      applyUrl: listing,
      publishedAt: iso(row.published_at || row.created_at),
    });
    return next ? [next] : [];
  });
}

async function startupJobs(): Promise<Job[]> {
  const xml = await pull("https://startup.jobs/feeds/jobs", "application/rss+xml");
  if (typeof xml !== "string") return [];
  return rssItems(xml).flatMap((item) => {
    const split = item.title.lastIndexOf(" at ");
    const title = split > 0 ? item.title.slice(0, split).trim() : item.title;
    const company = split > 0 ? item.title.slice(split + 4).trim() : "Startup Jobs";
    const listing = http(item.link.split("?")[0]);
    const next = job({
      source: "Startup Jobs",
      id: listing || item.title,
      title,
      company,
      location: "Remote",
      remote: true,
      salary: "",
      description: plain(item.description),
      tags: [],
      url: listing,
      applyUrl: listing,
      publishedAt: iso(item.pubDate),
    });
    return next ? [next] : [];
  });
}

const BOARD_CATEGORIES = ["programming", "design", "sales"];

async function getOnBoard(): Promise<Job[]> {
  const pages = await Promise.allSettled(
    BOARD_CATEGORIES.map((category) =>
      pull(
        `https://www.getonbrd.com/api/v0/categories/${category}/jobs?per_page=20&page=1&expand=%5B%22company%22%5D`,
      ),
    ),
  );
  const rows = pages.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value || typeof result.value !== "object") return [];
    const data = (result.value as { data?: unknown[] }).data;
    return Array.isArray(data) ? data : [];
  });
  if (!rows.length) throw new Error("no jobs");
  return rows.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const attributes = (row.attributes ?? {}) as Record<string, unknown>;
    const company = (attributes.company as { data?: { attributes?: { name?: string } } } | undefined)?.data
      ?.attributes?.name;
    const links = (row.links ?? {}) as Record<string, unknown>;
    const listing = http(links.public_url);
    const modality = str(attributes.remote_modality || attributes.modality).toLowerCase();
    const cities = Array.isArray(attributes.location_cities)
      ? attributes.location_cities.filter((city): city is string => typeof city === "string")
      : [];
    const place =
      modality === "fully_remote" || modality === "remote" || modality === "remote_local"
        ? "Remote"
        : modality === "hybrid"
          ? "Hybrid"
          : modality === "temporarily_remote"
            ? "Temporarily remote"
            : "On site";
    const remote = place !== "On site";
    const next = job({
      source: "Get on Board",
      id: str(row.id) || listing,
      title: str(attributes.title),
      company: company || "Get on Board",
      location: cities.length ? `${cities.join(", ")} · ${place}` : place,
      remote,
      salary: labeledSalary(attributes.min_salary, attributes.max_salary),
      description: plain([attributes.description, attributes.functions, attributes.projects].map(str).filter(Boolean).join("\n")),
      tags: tagsOf(attributes.category_name, place, attributes.perks),
      url: listing,
      applyUrl: listing,
      publishedAt: iso(attributes.published_at),
    });
    return next ? [next] : [];
  });
}

async function dribbble(): Promise<Job[]> {
  const xml = await pull("https://dribbble.com/jobs.rss", "application/rss+xml");
  if (typeof xml !== "string") return [];
  return rssItems(xml).flatMap((item) => {
    const hiring = item.title.match(/^(.*?) is hiring for a position of (.*?) in (.*)$/i);
    const listing = http(item.link.split("?")[0]);
    const next = job({
      source: "Dribbble",
      id: listing || item.title,
      title: hiring?.[2]?.trim() || item.title,
      company: hiring?.[1]?.trim() || "Dribbble",
      location: hiring?.[3]?.trim() || "",
      remote: /remote/i.test(item.title),
      salary: "",
      description: plain(item.description || item.title),
      tags: ["Design"],
      url: listing || http(item.link),
      applyUrl: http(item.link) || listing,
      publishedAt: iso(item.pubDate),
    });
    return next ? [next] : [];
  });
}

async function pythonJobs(): Promise<Job[]> {
  const xml = await pull("https://www.python.org/jobs/feed/rss/", "application/rss+xml");
  if (typeof xml !== "string") return [];
  return rssItems(xml).flatMap((item) => {
    const comma = item.title.lastIndexOf(",");
    const tail = comma > 0 ? item.title.slice(comma + 1).trim() : "";
    const company = tail && tail.length < 40 && !/remote|europe|america|asia|africa/i.test(tail) ? tail : "Python.org";
    const title = company === "Python.org" ? item.title : item.title.slice(0, comma).trim();
    const listing = http(item.link);
    const remote = /\bremote\b/i.test(`${item.title} ${item.description}`);
    const next = job({
      source: "Python.org",
      id: listing || item.title,
      title,
      company,
      location: remote ? "Remote" : "",
      remote,
      salary: "",
      description: plain(item.description),
      tags: ["Python"],
      url: listing,
      applyUrl: listing,
      publishedAt: iso(item.pubDate),
    });
    return next ? [next] : [];
  });
}

async function devIt(): Promise<Job[]> {
  const xml = await pull("https://devitjobs.uk/rss", "application/rss+xml");
  if (typeof xml !== "string") return [];
  return rssItems(xml)
    .slice(0, 80)
    .flatMap((item) => {
      const matched = item.title.match(/^(.*?)\s+@\s+(.*?)(?:\s+\[(.*)\])?$/);
      const title = matched?.[1]?.trim() || item.title;
      const company = matched?.[2]?.trim() || "DevIT Jobs";
      const salary = matched?.[3]?.trim() || "";
      const listing = http(item.link);
      const blob = `${title} ${item.description}`.toLowerCase();
      const next = job({
        source: "DevIT Jobs",
        id: listing || item.title,
        title,
        company,
        location: "United Kingdom",
        remote: /\b(remote|hybrid|work from home)\b/.test(blob),
        salary,
        description: plain(item.description),
        tags: tagsOf(item.category),
        url: listing,
        applyUrl: listing,
        publishedAt: iso(item.pubDate),
      });
      return next ? [next] : [];
    });
}

async function nomads(): Promise<Job[]> {
  const payload = (await pull("https://www.workingnomads.com/api/exposed_jobs/")) as unknown[];
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const next = job({
      source: "Working Nomads",
      id: http(row.url),
      title: str(row.title),
      company: str(row.company_name),
      location: str(row.location) || "Remote",
      remote: true,
      salary: "",
      description: plain(row.description),
      tags: tagsOf(row.tags, row.category_name),
      url: http(row.url),
      applyUrl: http(row.url),
      publishedAt: iso(row.pub_date),
    });
    return next ? [next] : [];
  });
}

function newest(jobs: Job[], count: number): Job[] {
  return [...jobs]
    .sort((a, b) => Date.parse(b.publishedAt || "0") - Date.parse(a.publishedAt || "0"))
    .slice(0, count);
}

function workplaceRemote(workplace: string, location: string): boolean {
  return workplace === "remote" || workplace === "hybrid" || /\bremote\b/i.test(`${workplace} ${location}`);
}

const GREENHOUSE_BOARDS = [
  "airbnb",
  "airtable",
  "asana",
  "cloudflare",
  "coinbase",
  "databricks",
  "discord",
  "dropbox",
  "duolingo",
  "figma",
  "gitlab",
  "instacart",
  "pinterest",
  "reddit",
  "robinhood",
  "stripe",
  "twilio",
];

async function greenhouse(): Promise<Job[]> {
  const pages = await Promise.allSettled(
    GREENHOUSE_BOARDS.map(async (token) => {
      const payload = (await pull(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`)) as {
        jobs?: Record<string, unknown>[];
      };
      const rows = Array.isArray(payload.jobs) ? payload.jobs : [];
      return newest(
        rows.flatMap((row) => {
          const location = str((row.location as { name?: string } | undefined)?.name);
          const listing = http(row.absolute_url);
          const next = job({
            source: "Greenhouse",
            id: str(row.id) || listing,
            title: str(row.title),
            company: str(row.company_name) || titleCaseSlug(token),
            location,
            remote: workplaceRemote("", location),
            salary: "",
            description: plain([str(row.title), location].filter(Boolean).join(". ")),
            tags: [],
            url: listing,
            applyUrl: listing,
            publishedAt: iso(row.first_published || row.updated_at),
          });
          return next ? [next] : [];
        }),
        20,
      );
    }),
  );
  const jobs = pages.flatMap((page) => (page.status === "fulfilled" ? page.value : []));
  if (!jobs.length) throw new Error("no jobs");
  return jobs;
}

const LEVER_BOARDS: Record<string, string> = {
  palantir: "Palantir",
  spotify: "Spotify",
};

async function lever(): Promise<Job[]> {
  const pages = await Promise.allSettled(
    Object.entries(LEVER_BOARDS).map(async ([token, company]) => {
      const payload = (await pull(`https://api.lever.co/v0/postings/${token}?mode=json`)) as Record<string, unknown>[];
      const rows = Array.isArray(payload) ? payload : [];
      return newest(
        rows.flatMap((row) => {
          const categories = (row.categories ?? {}) as Record<string, unknown>;
          const location = str(categories.location);
          const workplace = str(row.workplaceType).toLowerCase();
          const listing = http(row.hostedUrl);
          const next = job({
            source: "Lever",
            id: str(row.id) || listing,
            title: str(row.text),
            company,
            location,
            remote: workplaceRemote(workplace, location),
            salary: "",
            description: plain(row.descriptionPlain || row.description),
            tags: tagsOf(categories.department, categories.team, categories.commitment, workplace),
            url: listing,
            applyUrl: http(row.applyUrl) || listing,
            publishedAt: iso(row.createdAt),
          });
          return next ? [next] : [];
        }),
        25,
      );
    }),
  );
  const jobs = pages.flatMap((page) => (page.status === "fulfilled" ? page.value : []));
  if (!jobs.length) throw new Error("no jobs");
  return jobs;
}

const ASHBY_BOARDS: Record<string, string> = {
  linear: "Linear",
  notion: "Notion",
  openai: "OpenAI",
  ramp: "Ramp",
  snowflake: "Snowflake",
};

async function ashby(): Promise<Job[]> {
  const pages = await Promise.allSettled(
    Object.entries(ASHBY_BOARDS).map(async ([token, company]) => {
      const payload = (await pull(`https://api.ashbyhq.com/posting-api/job-board/${token}`)) as {
        jobs?: Record<string, unknown>[];
      };
      const rows = Array.isArray(payload.jobs) ? payload.jobs : [];
      return newest(
        rows.flatMap((row) => {
          const location = str(row.location);
          const workplace = str(row.workplaceType).toLowerCase();
          const listing = http(row.jobUrl);
          const next = job({
            source: "Ashby",
            id: str(row.id) || listing,
            title: str(row.title),
            company,
            location,
            remote: row.isRemote === true || workplaceRemote(workplace, location),
            salary: "",
            description: plain(row.descriptionPlain || row.descriptionHtml),
            tags: tagsOf(row.department, row.team, row.employmentType, workplace),
            url: listing,
            applyUrl: http(row.applyUrl) || listing,
            publishedAt: iso(row.publishedAt),
          });
          return next ? [next] : [];
        }),
        20,
      );
    }),
  );
  const jobs = pages.flatMap((page) => (page.status === "fulfilled" ? page.value : []));
  if (!jobs.length) throw new Error("no jobs");
  return jobs;
}

function dedupe(jobs: Job[]): Job[] {
  const map = new Map<string, Job>();
  for (const item of jobs) {
    const key = `${item.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")}`;
    const previous = map.get(key);
    if (!previous || item.description.length > previous.description.length) map.set(key, item);
  }
  return [...map.values()].sort(
    (a, b) => Date.parse(b.publishedAt || "0") - Date.parse(a.publishedAt || "0"),
  );
}

export async function loadJobs(force = false): Promise<JobsPayload> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.payload;
  const batches = await Promise.all([
    fromSource("Remotive", remotive),
    fromSource("Remote OK", remoteOk),
    fromSource("Jobicy", jobicy),
    fromSource("Arbeitnow", () => arbeitnowBoard("Arbeitnow", "https://www.arbeitnow.com/api/job-board-api")),
    fromSource("Arbeitnow UK", () =>
      arbeitnowBoard("Arbeitnow UK", "https://www.arbeitnow.co.uk/api/job-board-api"),
    ),
    fromSource("Working Nomads", nomads),
    fromSource("Himalayas", himalayas),
    fromSource("We Work Remotely", weWork),
    fromSource("DevIT Jobs", devIt),
    fromSource("Landing.jobs", landingJobs),
    fromSource("Startup Jobs", startupJobs),
    fromSource("Get on Board", getOnBoard),
    fromSource("Dribbble", dribbble),
    fromSource("Python.org", pythonJobs),
    fromSource("Greenhouse", greenhouse),
    fromSource("Lever", lever),
    fromSource("Ashby", ashby),
  ]);
  const payload: JobsPayload = {
    jobs: dedupe(batches.flatMap((batch) => batch.jobs)),
    fetchedAt: new Date().toISOString(),
    sources: batches.map((batch) => batch.report),
  };
  cache = { at: Date.now(), payload };
  return payload;
}
