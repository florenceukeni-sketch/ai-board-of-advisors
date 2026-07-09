# AI Board of Advisors

Six calibrated AI advisors who don't just answer your question. They debate it.

Most "AI persona" tools run personas in parallel: you get six independent monologues that never touch. This one runs them in sequence. Each advisor receives the full transcript of what the advisors before them said, and their system prompt instructs them to engage: agree, push back, or build. The result is intellectual friction you can't get from prompting one model six times.

Built as a deliberately minimal stack: Node.js, Express, vanilla JavaScript, no framework, no build step, no database. One command to run.

## The board

| Advisor | Lens |
|---|---|
| Marcus V., CFO | ROI, opportunity cost, forced prioritization |
| Lena W., AI Strategy Partner | Long-horizon capability plays, frameworks |
| Jared S., Chief AI Officer | AI at work, workflow transformation |
| The Critic | Stress-testing, the flaw before it finds you |
| Alex R., AI Veteran | What actually ships versus what is hype |
| Mia K., Growth Operator | Systems, compounding returns, shipping |

Each persona is defined in `advisors.js` with a distinct voice, a strategic lens, and a strict output format. Edit that one file to make the board yours.

## Quick start

Requires [Node.js 18+](https://nodejs.org). No other tooling.

```bash
npm install
cp .env.example .env      # then paste your Anthropic API key into .env
npm start
```

Open http://localhost:3000. Get an API key at [console.anthropic.com](https://console.anthropic.com). Your key stays in `.env` on your machine; it is gitignored and never reaches the browser.

## How a board session works

```
Topic from user
      |
      v
Advisor 1 (opens cold) ──────────────┐
      |                              |
      v                              |
Advisor 2 (sees Advisor 1) ──────────┤
      |                              |  running
      v                              |  debate
Advisor 3 (sees 1 + 2) ──────────────┤  log
      |                              |
     ...                             |
      v                              |
Advisor 6 (sees all five) ───────────┘
      |
      v
Exportable markdown transcript
```

The frontend makes six sequential calls to `POST /api/chat`. The server injects the accumulated debate log into each advisor's system prompt, so advisor four can tell advisor two they're wrong, specifically and by name. After the round completes, the session exports as a timestamped markdown transcript.

## Architecture decisions

**The API key never touches the browser.** All Anthropic calls go through the Express server. The frontend only ever talks to `/api/*`. This is the correct pattern for any AI-powered web app, personal or not.

**Advisor IDs are validated before touching the filesystem.** Session routes build file paths from URL parameters, so IDs are checked against the known advisor list first. Unvalidated path parameters are a classic path traversal vector.

**Flat JSON over a database.** Sessions are date-keyed files per advisor; memories are a capped array (last 25 entries) in `memories.json`. A database would be premature for single-user, low-write data. The `data/` directory is gitignored, so every user gets their own local state.

**No frontend framework.** One HTML file, no build pipeline, nothing to maintain. The DOM update pattern appends advisor cards individually during board sessions rather than re-rendering, so the progress indicator stays fixed while responses arrive below it.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/chat` | Proxies to the Anthropic API with the advisor's system prompt |
| GET | `/api/advisors` | Advisor metadata (system prompts stripped) |
| GET | `/api/sessions/:advisorId` | Most recent saved conversation |
| POST | `/api/sessions/:advisorId` | Save today's conversation |
| DELETE | `/api/sessions/:advisorId` | Clear an advisor's sessions |
| GET / POST / DELETE | `/api/memory` | Read, append, or remove persistent board memories |
| POST | `/api/board-sessions` | Archive a completed board debate |

Model and token limits live in `config.js`.

## Why this runs locally, not hosted

A deliberate decision. This app has no authentication layer, and the Anthropic API key lives server-side. Hosting it publicly would mean anyone with the URL could run board sessions against my API budget. Adding auth would solve that, but for a personal advisory tool it's complexity without payoff.

So the deployment model is: clone it, add your own key, run it on your machine. Your usage, your key, your data. Serverless functions were prototyped and cut for a second reason: they have no persistent filesystem, which kills the cross-session memory feature that makes the board worth returning to.

## Customizing the board

Every advisor is an object in `advisors.js`: an ID, display metadata, suggested prompts, and a system prompt. To add a seventh advisor or replace the board entirely, edit that file and restart. The system prompts follow a consistent structure worth keeping: who the advisor is, who they're advising and with what context, their voice, and a strict output format.

## Built by

[Florence Ukeni](https://florence-ukeni.netlify.app), Content Manager at the Center for Applied AI at the University of Chicago Booth School of Business. This is part of a series of working AI systems exploring persona architecture, sequential agent chaining, and practical AI implementation. MIT licensed.
