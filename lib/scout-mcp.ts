import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { loadJobs } from "@/lib/aggregate";
import { geminiLetter, geminiTailored, localLetter, localTailored } from "@/lib/letter";
import { scoreJobs } from "@/lib/match";
import type { Job, Profile, ScoredJob } from "@/lib/types";

function text(body: string, isError = false) {
  return { content: [{ type: "text" as const, text: body }], isError };
}

function profileFrom(input: {
  resume: string;
  name?: string;
  roles?: string;
  location?: string;
  remoteOnly?: boolean;
}): Profile {
  return {
    name: input.name?.trim() ?? "",
    roles: input.roles?.trim() ?? "",
    location: input.location?.trim() ?? "",
    remoteOnly: input.remoteOnly !== false,
    resume: input.resume,
    geminiKey: "",
  };
}

function asScored(input: {
  title: string;
  company: string;
  description: string;
  url?: string;
}): ScoredJob {
  const listing = input.url?.trim() || "";
  const job: Job = {
    id: "mcp",
    title: input.title,
    company: input.company,
    location: "",
    remote: true,
    salary: "",
    description: input.description,
    tags: [],
    url: listing,
    applyUrl: listing,
    source: "Sample",
    sourceHome: "",
    publishedAt: "",
  };
  return { job, score: 0, matched: [], missing: [], reasons: [] };
}

export function createScoutServer() {
  const server = new McpServer({ name: "scoutroles", version: "0.1.0" });

  server.registerTool(
    "rank_jobs",
    {
      title: "Rank open roles",
      description:
        "Load public job feeds and rank them against a resume. Returns the strongest matches with links back to the original postings.",
      inputSchema: {
        resume: z.string().min(40).describe("Resume text"),
        roles: z.string().optional().describe("Target roles, comma separated"),
        location: z.string().optional().describe("City or region to prefer"),
        remoteOnly: z.boolean().optional().describe("Keep remote roles only. Defaults to true."),
        limit: z.number().int().min(1).max(15).optional().describe("How many roles to return. Defaults to 8."),
      },
    },
    async ({ resume, roles, location, remoteOnly, limit }) => {
      try {
        const payload = await loadJobs(false);
        const profile = profileFrom({ resume, roles, location, remoteOnly });
        const ranked = scoreJobs(
          payload.jobs.filter((job) => (profile.remoteOnly ? job.remote : true)),
          profile,
        ).slice(0, limit ?? 8);
        const jobs = ranked.map((item) => ({
          title: item.job.title,
          company: item.job.company,
          location: item.job.location,
          score: item.score,
          url: item.job.url,
          source: item.job.source,
          matched: item.matched,
          description: item.job.description.slice(0, 500),
        }));
        return text(JSON.stringify({ fetchedAt: payload.fetchedAt, jobs }, null, 2));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not rank jobs.";
        return text(message, true);
      }
    },
  );

  server.registerTool(
    "draft_letter",
    {
      title: "Draft an application letter",
      description:
        "Write a finished application letter. Tries Gemini 3.8 Flash, then 3.6 Flash and 3.5 Flash-Lite if 3.8 is busy.",
      inputSchema: {
        resume: z.string().min(40).describe("Resume text"),
        name: z.string().optional().describe("Candidate name"),
        title: z.string().describe("Job title"),
        company: z.string().describe("Company name"),
        description: z.string().describe("Job description"),
        url: z.string().optional().describe("Original posting URL"),
        geminiKey: z.string().optional().describe("Google AI Studio key. GEMINI_API_KEY is used when this is omitted."),
      },
    },
    async ({ resume, name, title, company, description, url, geminiKey }) => {
      const profile = profileFrom({ resume, name });
      const scored = asScored({ title, company, description, url });
      const plain = localLetter(profile, scored);
      const key = geminiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
      if (!key) {
        return text(`source: plain\n\n${plain}`);
      }
      try {
        const letter = await geminiLetter(key, profile, scored);
        return text(`source: ${letter.model}\n\n${letter.text}`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Gemini did not finish.";
        return text(`source: plain\nnote: ${message}\n\n${plain}`);
      }
    },
  );

  server.registerTool(
    "draft_resume",
    {
      title: "Draft a resume for one job",
      description:
        "Rewrite a resume for one job using only facts from the original resume. Uses Gemini when a key is available, and always returns a complete resume.",
      inputSchema: {
        resume: z.string().min(40).describe("Resume text"),
        name: z.string().optional().describe("Candidate name"),
        title: z.string().describe("Job title"),
        company: z.string().describe("Company name"),
        description: z.string().describe("Job description"),
        url: z.string().optional().describe("Original posting URL"),
        geminiKey: z.string().optional().describe("Google AI Studio key. GEMINI_API_KEY is used when this is omitted."),
      },
    },
    async ({ resume, name, title, company, description, url, geminiKey }) => {
      const profile = profileFrom({ resume, name });
      const scored = asScored({ title, company, description, url });
      const plain = localTailored(profile, scored);
      const key = geminiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
      if (!key) {
        return text(`source: plain\n\n${plain}`);
      }
      try {
        const draft = await geminiTailored(key, profile, scored);
        return text(`source: ${draft.model}\n\n${draft.text}`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Gemini did not finish.";
        return text(`source: plain\nnote: ${message}\n\n${plain}`);
      }
    },
  );

  return server;
}
