# SSHT 2026 — Setting up the forms

Two files do the work:

- **`Code.gs`** — the backend. Lives inside your Google Sheet. Receives form
  submissions, writes rows, enforces the caps, sends the confirmation emails.
- **`index.html`** — the website. Contains both forms.

You need to do this once. Budget about ten minutes.

---

## 1. Create the spreadsheet

1. Go to <https://sheets.new> — this makes a new, empty Google Sheet.
2. Name it something like **SSHT 2026 — Registrations**.
3. Leave it open.

## 2. Install the backend

1. In that sheet: **Extensions → Apps Script**. A code editor opens in a new tab.
2. Delete whatever is in `Code.gs` (usually an empty `myFunction`).
3. Paste in the entire contents of the `Code.gs` file I gave you.
4. Near the top you'll find the `CONFIG` block. **Change this one line:**

   ```js
   CONTACT_EMAIL: 'CHANGE_ME@nchu.edu.tw',
   ```

   to the address you want people to reply to. Everything else already has a
   sensible value.

5. Click the **save** icon (💾).

## 3. Grant permissions

1. In the Apps Script editor, pick **`setup`** from the function dropdown at
   the top, then click **Run**.
2. Google will ask for permission. Click **Review permissions** → choose your
   account → you'll see a scary *"Google hasn't verified this app"* screen.
   This is normal for your own scripts. Click **Advanced** →
   **Go to (project name) (unsafe)** → **Allow**.
3. Go back to the spreadsheet tab. You should now see two new sheets at the
   bottom: **Registrations** and **Posters**, with styled headers.

> The warning appears because the script is yours and unpublished, not because
> anything is wrong. Only you can run it.

## 4. Deploy it as a Web App

1. Back in the Apps Script editor: **Deploy → New deployment**.
2. Click the gear icon next to *Select type* → choose **Web app**.
3. Fill in:
   - **Description:** `SSHT 2026 forms`
   - **Execute as:** **Me** ← important
   - **Who has access:** **Anyone** ← important, and it does *not* mean anyone
     can see your spreadsheet. It only means anyone can submit the form.
4. Click **Deploy**, approve again if asked.
5. Copy the **Web app URL**. It looks like:

   ```
   https://script.google.com/macros/s/AKfycb…/exec
   ```

## 5. Connect the website

1. Open `index.html` in a text editor.
2. Find this line (it's near the bottom, at the top of the `<script>` block):

   ```js
   var ENDPOINT = '';
   ```

3. Paste your URL between the quotes:

   ```js
   var ENDPOINT = 'https://script.google.com/macros/s/AKfycb…/exec';
   ```

4. Save. Done.

## 6. Test it

Open `index.html` in a browser and submit the attendance form with your own
email address. Within a few seconds you should see:

- a new row in the **Registrations** sheet, marked `Confirmed`
- a confirmation email in your inbox
- the counter on the page tick up to `1 / 110`

Then delete that test row (delete the whole row, not just the contents).

---

## Day-to-day

### Watching the numbers

The two counters on the website read live from the sheet. `Status` column:

| Value | Meaning |
|---|---|
| `Confirmed` | Has a place. Counts toward the 110 / 20. |
| `Waitlist` | Submitted after the cap was reached. |
| `Cancelled` | Type this yourself when someone drops out. Frees a place. |

Only rows reading exactly `Confirmed` count. So to free a seat, change that
person's Status to `Cancelled` — don't delete the row, you'll want the record.

### When someone cancels

The spreadsheet has an **SSHT 2026** menu (reload the sheet if you don't see it):

- **Promote from waitlist** — moves the longest-waiting person to `Confirmed`.
  It tells you who, so you can email them. It refuses if you're still at the cap.

### Setting the deadlines

When you decide them, edit these two lines in `Code.gs` and save:

```js
REGISTRATION_DEADLINE: '2026-10-15',
POSTER_DEADLINE: '2026-09-24',
```

Format is `YYYY-MM-DD`. Submissions close at 23:59:59 Taipei time on that day.
Leaving them as `''` keeps them open forever. **You do not need to redeploy** —
saving is enough.

### Changing anything else in Code.gs

Same rule: save, and it takes effect. You only need **Deploy → Manage
deployments → edit (✏️) → Version: New version → Deploy** if you ever want the
URL to stay the same while making a fresh versioned release. For small config
tweaks, just saving works.

---

## Things worth knowing

**Email limits.** A personal Gmail account can send 100 emails a day; an NCHU
Workspace account gets 1,500. With a 110-person cap you're fine either way, but
use the university account if you have it — the confirmation will come from an
`nchu.edu.tw` address, which looks far better to your international speakers.

**No file uploads.** By design. Google's file-upload field forces the person to
log into a Google account, which is a real barrier for the UK and Korean
attendees. That's why the abstract is a plain text box.

**Privacy.** The spreadsheet stays private to you. Nobody submitting the form can
see it, and nobody needs an account to submit.

**If a submission ever fails**, the person sees an error and can retry — nothing
is silently lost. If the confirmation *email* fails, the row is still saved; the
script deliberately never lets a mail problem discard someone's registration.

**Hosting.** `index.html` is one self-contained file. It'll work on NCHU web
space, GitHub Pages, Netlify — anywhere that serves a static file. Open it
locally to test; the form talks to Apps Script over HTTPS either way.

---

## Still to do

- Fill in `CONTACT_EMAIL` in `Code.gs`.
- Fill in `ENDPOINT` in `index.html`.
- Decide the two deadlines.
- Confirm Benjamin Moss's affiliation, Thomas Anthopoulos's affiliation
  (Imperial vs Manchester), and James Durrant's talk title — all three are
  flagged in the page as placeholders.
