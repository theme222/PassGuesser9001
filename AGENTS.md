# AGENTS.md — Development Guidelines & System Architecture

This file contains architectural guidelines, operational constraints, and development instructions for automated agents and developers working on **PassGuesser9001**.

---

## 1. Project Overview

**PassGuesser9001** is a headless browser automation service built with **Playwright**, **Node.js**, and **TypeScript**. It automates authentication and clue-key guessing against the CEDT Derby challenge web application.

- **Login URL**: `https://cedt-derby.cu-cp.com/login.php`
- **Target URL**: `https://cedt-derby.cu-cp.com/clues.php?race=3`
- **Execution Interval**: Scheduled to run every **61 minutes** in background via Docker cron.
- **Timezone**: **GMT+7** (`Asia/Bangkok`).

---

## 2. Directory & File Structure

```text
PassGuesser9001/
├── AGENTS.md               # Agent guidelines and architectural documentation
├── GEMINI.md               # Symlink to AGENTS.md for tool compatibility
├── README.md               # Human-facing project overview and run guide
├── Dockerfile              # Container image definition (Playwright base, GMT+7, cron)
├── docker-compose.yml      # Service orchestration with persistent file bind mounts
├── cron-runner.sh          # 61-minute interval enforcement script with flock locking
├── entrypoint.sh           # Container entrypoint configuring cron and initial run
├── package.json            # Node.js project configuration and scripts
├── tsconfig.json           # TypeScript configuration (NodeNext, ES2022)
├── .env                    # Runtime credentials (NEVER read directly by tools)
├── .env.example            # Template for environment variables
├── .dockerignore           # Build context exclusions (node_modules, dist, .git)
├── .gitignore              # Git ignore rules
├── logs.txt                # Standardized execution logs (real-time, GMT+7)
├── words/                  # Wordlists and tracked keys directory
│   ├── wordlist.txt        # 100k common English dictionary words
│   ├── externalused.txt    # Keys tested by external systems (STRICTLY READ-ONLY)
│   └── scriptused.txt      # Keys tested by this script (appended selectively)
└── src/
    └── index.ts            # Main Playwright automation entrypoint
```

---

## 3. Strict Operational Invariants & Rules for Agents

1. **Environment Privacy (`.env`)**:
   - **NEVER** use agent inspection tools (e.g. `view_file`) on `.env`.
   - Credentials (`STUDENT_ID` and `STUDENT_PASSWORD`) must only be accessed through `process.env` at runtime.
   - Build-time validation inside the `Dockerfile` guarantees that `.env` exists and contains non-empty keys before an image is created.

2. **Wordlist Rules (`words/`)**:
   - [`words/externalused.txt`](words/externalused.txt) is **strictly read-only**. The script must **never** modify, overwrite, or delete this file.
   - All word comparisons must be **case-sensitive**, strip whitespace, and ignore blank lines.
   - Exactly **3 unique candidate words** are randomly selected per run that do not exist in either [`words/scriptused.txt`](words/scriptused.txt) or [`words/externalused.txt`](words/externalused.txt).

3. **Selective Recording to [`words/scriptused.txt`](words/scriptused.txt)**:
   - Success is verified by checking whether the returned HTML no longer has the input box (`name="key"`). If the input box is still present in the returned HTML, the attempt was not unlocked.
   - Append a word to [`words/scriptused.txt`](words/scriptused.txt) **ONLY** if:
     - The attempt resulted in the wrong key error (`"Wrong key — check your working."`).
     - OR the attempt was successful (`"Successful login attempt"`).
   - If the script fails for **any other reason** (e.g., rate limit `"Too many wrong attempts — wait an hour."`, missing inputs, network timeout, session expiration), the word **MUST NOT** be recorded in [`words/scriptused.txt`](words/scriptused.txt).

4. **Logging Format ([`logs.txt`](logs.txt))**:
   - All log messages must be formatted with millisecond precision in **GMT+7**:
     ```text
     [STATUS (ERROR / INVALID / SUCCESS)] <yyyy/mm/dd hh:mm:ss.ms> "txt"
     ```
   - **Statuses**:
     - `ERROR`: Rate limit errors, unable to locate input box, missing configs, network failures, session loss.
     - `INVALID`: Wrong key attempt (`"Wrong key — check your working."`).
     - `SUCCESS`: Successful login or clue key unlock.

5. **61-Minute Cron Interval**:
   - Server-side rate limits reset hourly. The 61-minute interval (`3660` seconds) ensures safe execution without burning attempts.
   - Handled via [`cron-runner.sh`](cron-runner.sh) using `flock` and timestamp tracking.

---

## 4. Development & Running Commands

### Local Development

```bash
# Install dependencies
npm install

# Run once via TypeScript
npm start

# Run in watch mode
npm run dev

# Compile TypeScript
npm run build
```

### Docker Management

```bash
# Build and run in background (GMT+7, persistent mounts)
docker compose up -d --build

# View real-time container output
docker compose logs -f

# Check container status
docker compose ps

# Stop container
docker compose down
```
