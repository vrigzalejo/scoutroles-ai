export type JobSource =
  | "Remotive"
  | "Remote OK"
  | "Jobicy"
  | "Arbeitnow"
  | "Arbeitnow UK"
  | "Working Nomads"
  | "Himalayas"
  | "We Work Remotely"
  | "DevIT Jobs"
  | "Landing.jobs"
  | "Startup Jobs"
  | "Get on Board"
  | "Dribbble"
  | "Python.org"
  | "Greenhouse"
  | "Lever"
  | "Ashby"
  | "Sample";

export type Job = {
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
  source: JobSource;
  sourceHome: string;
  publishedAt: string;
};

export type SourceReport = {
  name: JobSource;
  home: string;
  count: number;
  ok: boolean;
  error?: string;
};

export type JobsPayload = {
  jobs: Job[];
  fetchedAt: string;
  sources: SourceReport[];
};

export type Profile = {
  name: string;
  roles: string;
  location: string;
  remoteOnly: boolean;
  resume: string;
  geminiKey: string;
};

export const emptyProfile: Profile = {
  name: "",
  roles: "",
  location: "",
  remoteOnly: true,
  resume: "",
  geminiKey: "",
};

export type TrackStatus = "saved" | "applied" | "interview" | "offer" | "passed";

export type Tracked = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  applyUrl: string;
  source: string;
  sourceHome: string;
  salary: string;
  description: string;
  score: number;
  matched: string[];
  missing: string[];
  reasons: string[];
  status: TrackStatus;
  letter: string;
  tailored: string;
  note: string;
  updatedAt: string;
};

export type ScoredJob = {
  job: Job;
  score: number;
  matched: string[];
  missing: string[];
  reasons: string[];
};

export const STATUS_ORDER: TrackStatus[] = [
  "interview",
  "offer",
  "applied",
  "saved",
  "passed",
];

export const STATUS_LABEL: Record<TrackStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  passed: "Passed",
};
