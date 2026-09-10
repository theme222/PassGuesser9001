import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium, type Browser, type Page, type Locator } from "playwright";

const LOGIN_URL = "https://cedt-derby.cu-cp.com/login.php";
const CLUES_URL = "https://cedt-derby.cu-cp.com/clues.php?race=3";

const WORDS_DIR = path.resolve(process.cwd(), "words");
const WORDLIST_PATH = path.resolve(WORDS_DIR, "wordlist.txt");
const SCRIPT_USED_PATH = path.resolve(WORDS_DIR, "scriptused.txt");
const EXTERNAL_USED_PATH = path.resolve(WORDS_DIR, "externalused.txt");
const LOGS_PATH = path.resolve(process.cwd(), "logs.txt");
const RESPONSE_DIR = path.resolve(process.cwd(), "response");

type LogStatus = "ERROR" | "INVALID" | "SUCCESS";

/**
 * Saves a copy of the returned HTML into the response/ subfolder as UNIXTIMESTAMP.html.
 */
function saveResponseHtml(html: string): string {
  if (!fs.existsSync(RESPONSE_DIR)) {
    fs.mkdirSync(RESPONSE_DIR, { recursive: true });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  let filename = `${timestamp}.html`;
  let filePath = path.join(RESPONSE_DIR, filename);
  if (fs.existsSync(filePath)) {
    filename = `${timestamp}_${Date.now()}.html`;
    filePath = path.join(RESPONSE_DIR, filename);
  }
  fs.writeFileSync(filePath, html, "utf-8");
  return filename;
}

/**
 * Formats a Date object into 'yyyy/mm/dd hh:mm:ss.ms'.
 */
function formatTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}.${ms}`;
}

/**
 * Appends a formatted log entry to logs.txt in the format:
 * [STATUS (ERROR / INVALID / SUCCESS)] <formatted yyyy/mm/dd hh:mm:ss.ms> "txt"
 */
function writeLog(status: LogStatus, message: string) {
  const timestamp = formatTimestamp();
  const cleanMsg = message.replace(/\r?\n/g, " ").replace(/"/g, '\\"');
  const line = `[${status}] <${timestamp}> "${cleanMsg}"`;
  fs.appendFileSync(LOGS_PATH, `${line}\n`, "utf-8");

  if (status === "ERROR" || status === "INVALID") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

/**
 * Reads a file containing one word per line, strips whitespace, ignores blank lines,
 * and returns a case-sensitive Set of words.
 */
function loadWordSet(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) {
    return new Set<string>();
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const words = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return new Set<string>(words);
}

/**
 * Reads wordlist.txt, filters out words existing in scriptused.txt OR externalused.txt
 * (strictly case-sensitive, stripping whitespace and ignoring blank lines),
 * and selects 3 unique words randomly.
 * Does NOT modify externalused.txt.
 */
function selectThreeRandomWords(): string[] {
  if (!fs.existsSync(WORDLIST_PATH)) {
    writeLog("ERROR", `Wordlist file not found at ${WORDLIST_PATH}`);
    process.exit(1);
  }

  const scriptUsed = loadWordSet(SCRIPT_USED_PATH);
  const externalUsed = loadWordSet(EXTERNAL_USED_PATH); // Read-only

  const wordlistContent = fs.readFileSync(WORDLIST_PATH, "utf-8");
  const candidateWords: string[] = [];
  const seenCandidates = new Set<string>();

  for (const rawLine of wordlistContent.split(/\r?\n/)) {
    const word = rawLine.trim();
    if (word.length === 0) continue;

    // Must not be in scriptused.txt AND must not be in externalused.txt (case-sensitive)
    if (!scriptUsed.has(word) && !externalUsed.has(word)) {
      if (!seenCandidates.has(word)) {
        seenCandidates.add(word);
        candidateWords.push(word);
      }
    }
  }

  if (candidateWords.length < 3) {
    writeLog(
      "ERROR",
      `Insufficient words in wordlist: only ${candidateWords.length} candidate words available (3 required).`
    );
    process.exit(1);
  }

  // Randomly select 3 unique words without replacement
  const selected: string[] = [];
  const chosenIndices = new Set<number>();
  while (selected.length < 3) {
    const randIdx = Math.floor(Math.random() * candidateWords.length);
    if (!chosenIndices.has(randIdx)) {
      chosenIndices.add(randIdx);
      selected.push(candidateWords[randIdx]);
    }
  }

  return selected;
}

/**
 * Appends a word to scriptused.txt on a new line.
 */
function appendToScriptUsed(word: string) {
  if (!fs.existsSync(WORDS_DIR)) {
    fs.mkdirSync(WORDS_DIR, { recursive: true });
  }
  let prefix = "";
  if (fs.existsSync(SCRIPT_USED_PATH)) {
    const existing = fs.readFileSync(SCRIPT_USED_PATH, "utf-8");
    if (existing.length > 0 && !existing.endsWith("\n")) {
      prefix = "\n";
    }
  }
  fs.appendFileSync(SCRIPT_USED_PATH, `${prefix}${word}\n`, "utf-8");
}

/**
 * Finds the card-body containing an h2 with "Clue 1".
 */
async function findClue1Card(page: Page): Promise<Locator | null> {
  const cardBodies = await page.locator(".card-body").all();
  for (const card of cardBodies) {
    const h2Count = await card.locator("h2").count();
    if (h2Count > 0) {
      const h2Text = await card.locator("h2").first().innerText();
      if (h2Text.includes("Clue 1")) {
        return card;
      }
    }
  }
  return null;
}

async function main() {
  const studentId = process.env.STUDENT_ID?.trim();
  const studentPassword = process.env.STUDENT_PASSWORD?.trim();

  if (!studentId || !studentPassword) {
    writeLog(
      "ERROR",
      "Missing required environment variables. Please provide STUDENT_ID and STUDENT_PASSWORD in the .env file."
    );
    process.exit(1);
  }

  // Select 3 random words
  const wordsToAttempt = selectThreeRandomWords();

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    const page: Page = await context.newPage();

    // 1. Navigate to login page
    try {
      const response = await page.goto(LOGIN_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (!response || !response.ok()) {
        writeLog(
          "ERROR",
          `Received non-OK HTTP status ${response?.status()} when navigating to ${LOGIN_URL}.`
        );
        process.exitCode = 1;
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      writeLog("ERROR", `Failed to connect to ${LOGIN_URL}: ${msg}`);
      process.exitCode = 1;
      return;
    }

    // 2. Locate login form inputs and submit button
    const sidInput = page.locator('input[name="sid"]');
    const pwInput = page.locator('input[name="pw"]');
    const submitButton = page.locator('form button, button:has-text("Log in")');

    const hasSid = (await sidInput.count()) > 0;
    const hasPw = (await pwInput.count()) > 0;
    const hasButton = (await submitButton.count()) > 0;

    if (!hasSid || !hasPw || !hasButton) {
      writeLog(
        "ERROR",
        `Failed to locate required login form elements on ${LOGIN_URL} (sid: ${hasSid}, pw: ${hasPw}, submit: ${hasButton}).`
      );
      process.exitCode = 1;
      return;
    }

    // 3. Fill in credentials and submit
    await sidInput.fill(studentId);
    await pwInput.fill(studentPassword);

    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null),
        submitButton.first().click(),
      ]);
      await page.waitForLoadState("domcontentloaded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      writeLog("ERROR", `Failed while submitting the login form: ${msg}`);
      process.exitCode = 1;
      return;
    }

    // 4. Verify post-login redirection
    const postLoginUrl = page.url();
    if (postLoginUrl.includes("login.php")) {
      const alertElement = page.locator(".alert, .text-danger, .error-message");
      let detailMsg = "";
      if ((await alertElement.count()) > 0) {
        detailMsg = ` - Page message: "${(await alertElement.first().innerText()).trim()}"`;
      }

      writeLog(
        "ERROR",
        `Authentication unsuccessful. Remained on login page (${postLoginUrl})${detailMsg}.`
      );
      process.exitCode = 1;
      return;
    }

    // 5. Navigate to clues page
    try {
      const cluesResponse = await page.goto(CLUES_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (!cluesResponse || !cluesResponse.ok()) {
        writeLog(
          "ERROR",
          `Received status ${cluesResponse?.status()} when navigating to ${CLUES_URL}.`
        );
        process.exitCode = 1;
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      writeLog("ERROR", `Failed to navigate to clues page (${CLUES_URL}): ${msg}`);
      process.exitCode = 1;
      return;
    }

    // 6. Check if clues page redirected back to login
    if (page.url().includes("login.php")) {
      writeLog(
        "ERROR",
        `Access denied to clues page. Session is unauthenticated and was redirected back to ${page.url()}.`
      );
      process.exitCode = 1;
      return;
    }

    // 7. Verify initial clue card state before attempting guesses
    const initialClueCard = await findClue1Card(page);
    if (!initialClueCard) {
      writeLog("ERROR", "Unable to locate input box");
      process.exit(1);
    }

    const initialHtml = await page.content();
    const initialCardHtml = await initialClueCard.innerHTML().catch(() => "");
    const initialHasInput =
      initialHtml.includes('name="key"') ||
      initialHtml.includes('placeholder="clue key"') ||
      initialCardHtml.includes('name="key"');
    const initialIsLocked =
      initialCardHtml.includes("locked") ||
      initialHtml.includes(">locked<");

    // If Clue 1 is already unlocked
    if (!initialHasInput && !initialIsLocked) {
      writeLog("SUCCESS", "Successful login attempt (clue already unlocked)");
      return;
    }

    // If already rate-limited before guessing
    const initialRateLimited =
      initialHtml.includes("Too many wrong attempts — wait an hour.") ||
      (initialHtml.includes("Too many wrong attempts") && initialHtml.includes("wait an hour")) ||
      initialHtml.includes("0 attempts left this hour.") ||
      initialCardHtml.includes("0 attempts left this hour.");

    if (initialRateLimited) {
      writeLog("ERROR", "Too many wrong attempts — wait an hour.");
      return;
    }

    // 8. Attempt to unlock Clue 1 with the three selected words one by one
    for (let i = 0; i < wordsToAttempt.length; i++) {
      const word = wordsToAttempt[i];

      // Find the card-body containing "Clue 1"
      const clueCard = await findClue1Card(page);
      if (!clueCard) {
        writeLog("ERROR", "Unable to locate input box");
        process.exit(1);
      }

      const keyInput = clueCard.locator('input[name="key"], input.form-control');
      const unlockButton = clueCard.locator('button:has-text("Unlock"), form button');

      if ((await keyInput.count()) === 0 || (await unlockButton.count()) === 0) {
        writeLog("ERROR", "Unable to locate input box");
        process.exit(1);
      }

      // Fill in input box
      await keyInput.first().fill(word);

      // Submit form and wait for response
      let submitError: Error | null = null;
      let submitStatus: number | null = null;
      try {
        const [response] = await Promise.all([
          page.waitForResponse(
            (res) => res.url().includes("clues.php"),
            { timeout: 20000 }
          ),
          unlockButton.first().click(),
        ]);
        submitStatus = response.status();
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null);
      } catch (err: unknown) {
        submitError = err instanceof Error ? err : new Error(String(err));
      }

      // Save a copy of the returned HTML into response/UNIXTIMESTAMP.html for debugging
      try {
        const attemptResponseHtml = await page.content();
        saveResponseHtml(attemptResponseHtml);
      } catch {
        // Ignore if page content cannot be retrieved
      }

      // If submission timed out or failed, log ERROR and do NOT record word
      if (submitError) {
        writeLog("ERROR", `Form submission failed or timed out for word "${word}": ${submitError.message}`);
        break;
      }

      if (submitStatus && submitStatus >= 400) {
        writeLog("ERROR", `Server returned HTTP status ${submitStatus} when submitting word "${word}".`);
        break;
      }

      await page.waitForTimeout(500);

      // Verify if session was redirected back to login page
      if (page.url().includes("login.php")) {
        writeLog("ERROR", "Session lost: redirected to login page during clue attempts.");
        process.exitCode = 1;
        return;
      }

      // Verify we are still on the clues page
      if (!page.url().includes("clues.php")) {
        writeLog("ERROR", `Unexpected redirection to ${page.url()} during clue attempts.`);
        process.exitCode = 1;
        return;
      }

      // Check the returned page and Clue 1 card
      const returnedHtml = await page.content();
      const updatedClueCard = await findClue1Card(page);
      if (!updatedClueCard) {
        writeLog("ERROR", "Unable to locate input box");
        process.exit(1);
      }

      const cardHtml = await updatedClueCard.innerHTML().catch(() => "");

      const hasInputBox =
        returnedHtml.includes('name="key"') ||
        returnedHtml.includes('placeholder="clue key"') ||
        cardHtml.includes('name="key"');

      const isLocked =
        cardHtml.includes("locked") ||
        returnedHtml.includes(">locked<");

      const isTooManyAttempts =
        returnedHtml.includes("Too many wrong attempts — wait an hour.") ||
        (returnedHtml.includes("Too many wrong attempts") && returnedHtml.includes("wait an hour")) ||
        returnedHtml.includes("0 attempts left this hour.") ||
        cardHtml.includes("0 attempts left this hour.");

      if (isTooManyAttempts) {
        // The submitted guess was wrong and exhausted the hourly attempt limit
        writeLog("INVALID", "Wrong key — check your working.");
        appendToScriptUsed(word);
        writeLog("ERROR", "Too many wrong attempts — wait an hour.");
        break;
      }

      if (hasInputBox || isLocked) {
        // Returned HTML still has input box or locked badge -> wrong key attempt
        writeLog("INVALID", "Wrong key — check your working.");
        appendToScriptUsed(word);

        // Pause for 3 seconds before attempting the next word to avoid HTTP 503 rate limits
        if (i < wordsToAttempt.length - 1) {
          await page.waitForTimeout(3000);
        }
        continue;
      }

      // Returned HTML no longer has input box and is not locked -> genuine unlock
      writeLog("SUCCESS", `Successful login attempt: ${word}`);
      appendToScriptUsed(word);
      break;
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLog("ERROR", `An unhandled error occurred: ${msg}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
