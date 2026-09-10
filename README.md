# PassGuesser9001

Automated Playwright credential test suite and clue unlocking runner in TypeScript.

*Hella vibe coded (Would this be considered a ddos?)*

**IMPORTANT** MAKE SURE YOU HAVE A `.env` FILE WITH `STUDENT_ID` AND `STUDENT_PASSWORD` SET. AND THIS DIRECTORY IS NOT DELETED BECAUSE THE LOGS AND STUFF WILL BE LINKED TO THE HOST SYSTEM.
LOOK AT CONFIGURATION FOR MORE DETAILS.

## Features

- **Headless Chromium Automation**: Automated login and clue guessing using Playwright.
- **Word Filtering & Tracking**: Randomly samples words from `words/wordlist.txt` excluding entries in `words/scriptused.txt` and `words/externalused.txt`.
- **Selective Logging**:
  - Wrong guesses (`"Wrong key — check your working."`) and successful unlocks are recorded in `words/scriptused.txt`.
  - Rate-limit errors (`"Too many wrong attempts — wait an hour."`), connection issues, and other errors are NOT recorded in `words/scriptused.txt`.
- **Formatted Logs**: All outputs are formatted with millisecond precision in **GMT+7** (`Asia/Bangkok`) and written to `logs.txt`:
  ```text
  [STATUS (ERROR / INVALID / SUCCESS)] <yyyy/mm/dd hh:mm:ss.ms> "txt"
  ```
- **Scheduled Background Execution**: Runs every 61 minutes inside Docker using cron with persistent volume bind-mounts.
- **Build-Time `.env` Validation**: Docker build automatically halts if `.env` is absent or missing `STUDENT_ID` or `STUDENT_PASSWORD`.
- **Agent Rules Integration**: Full architectural and constraint documentation in [`AGENTS.md`](AGENTS.md) (linked via [`GEMINI.md`](GEMINI.md)).

---

## Configuration (`.env`)

Create a `.env` file in the project root:

```env
STUDENT_ID=your_student_id
STUDENT_PASSWORD=your_password
```

See [`.env.example`](file:///home/sirat/Code/PassGuesser9001/.env.example) for reference.

---

## Docker Execution (Recommended)

### Method 1: Docker Compose

Build the image and launch the container in the background:

```bash
docker compose up -d --build
```

- **Check status:**
  ```bash
  docker compose ps
  ```

- **View container output:**
  ```bash
  docker compose logs -f
  ```

- **Stop container:**
  ```bash
  docker compose down
  ```

### Method 2: Docker CLI

1. **Build image** (validates `.env` at build time):
   ```bash
   docker build -t passguesser9001 .
   ```

2. **Run container in background** (with restart policy, GMT+7 timezone, and persistent volume binds):
   ```bash
   docker run -d \
     --name passguesser9001 \
     --restart unless-stopped \
     -e TZ=Asia/Bangkok \
     -v "$(pwd)/words:/app/words" \
     -v "$(pwd)/logs.txt:/app/logs.txt" \
     -v "$(pwd)/.env:/app/.env" \
     passguesser9001
   ```

3. **Check container logs & status:**
   ```bash
   docker ps
   docker logs -f passguesser9001
   ```

---

## Persistent Bind Mounts

The following files and directories are bind-mounted between the host and container to ensure data persists across container restarts and host reboots:

- [`words/`](words/): Contains dictionary and tracking lists:
  - [`words/externalused.txt`](words/externalused.txt): External list of previously tested keys (read-only by the script).
  - [`words/scriptused.txt`](words/scriptused.txt): Appended with words tested by this automation.
  - [`words/wordlist.txt`](words/wordlist.txt): Wordlist source file.
- [`logs.txt`](logs.txt): Real-time formatted log entries (GMT+7).
- [`.env`](.env): Credentials configuration.

---

## Local Development (Without Docker)

1. **Install dependencies:**
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Run once:**
   ```bash
   npm start
   ```

3. **Build TypeScript:**
   ```bash
   npm run build
   ```
