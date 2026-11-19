# ScoutRoles

Web app for ranking open roles against your resume. It pulls public job feeds, scores them in the browser, drafts a short letter, and keeps a tracker. You open the original posting and send the application yourself.

Search requires a free account. Each email keeps that person's tracker and brief on this server, and Gemini letters and a resume tailored to each job are not capped. Those drafts use `GEMINI_API_KEY` on the server and only restate facts from the uploaded resume. The optional key field in the brief appears only when that server key is missing.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Paste a resume, or use the sample, then choose **Rank open roles**.

Accounts are stored in Postgres. Start the database, then the app:

```bash
docker compose up -d db
npm run dev
```

`DATABASE_URL` in `.env.local` should point at `localhost:5432`. Docker Compose uses the same database for the production app:

```bash
docker compose up --build
```

## Sources

Listings come from public feeds: Remotive, Remote OK, Jobicy, Arbeitnow, Arbeitnow UK, Working Nomads, Himalayas, We Work Remotely, DevIT Jobs, Landing.jobs, Startup Jobs, Get on Board, Dribbble, Python.org, plus public company boards on Greenhouse, Lever, and Ashby. Each card links back to the board that published it. Feeds are cached for 15 minutes.

LinkedIn, Indeed, Glassdoor, ZipRecruiter, and Monster do not publish an open job feed. ScoutRoles does not scrape those sites. Greenhouse, Lever, and Ashby do not offer one feed of every company, so ScoutRoles reads the public board API for a set of companies that post there.

## Free accounts

Sign in with Google or GitHub. ScoutRoles checks that provider’s confirmation and keeps one account per person, so knowing the email is not enough to open the saved resume or tracker. A confirmed email from either provider opens the same older account. Log out on a shared browser so the next person does not see the previous tracker or resume. Accounts are free and do not expire. Search is available only while an account is signed in. Gemini letters are included with no quota.

Set the provider callback to `http://localhost:3000/api/pass/oauth/callback`. Google needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. GitHub needs `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, plus a verified email on the GitHub account.

Set `GEMINI_API_KEY` in `.env.local` (gitignored) to write those included letters. Without it, the account still saves the tracker, and a personal key or the plain draft still works.

Accounts, trackers, and briefs are rows in Postgres. A Gemini key is never stored.

## Privacy

Pasted resume text stays in the browser until you start a free account. After that, the brief and tracker for that email are saved on this server. A Gemini key is never saved with the account. A PDF or Word file (.doc, .docx) is read by the local server to extract text and the file itself is not stored. Matching does not call a model. Letters from a personal key are sent only to Google. Included account letters and tailored resumes try Gemini 3.8 Flash first. If that model is busy, missing, or rejects its settings, the draft continues with Gemini 3.6 Flash and then Gemini 3.5 Flash-Lite.

## Cursor MCP

With `npm run dev` running, this repo exposes an MCP server at `http://localhost:3000/api/mcp`. Cursor picks it up from `.cursor/mcp.json`. Reload MCP servers in Cursor if the tools do not appear.

- `rank_jobs` ranks the public feeds against a resume.
- `draft_letter` returns a finished letter. Set `GEMINI_API_KEY` for a Gemini 3.8 Flash draft. With no key, the plain letter is returned.
- `draft_resume` rewrites the resume for one job, using only facts from the original resume.
