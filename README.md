# Drywall Count

An iPhone app for counting drywall on a house, built to be very hard to get wrong. It works with **no signal**, builds a one-page **count sheet PDF** as you go, and at the end sends the PDF, a Google Maps pin, and a short message by text.

It's a web app that you add to the Home Screen. It opens and works like a normal app, without the App Store.

**English and Español.** The first time it opens it asks *English or Español?* with two big buttons. After that, a 🌐 button on every screen switches languages with one tap, and nothing he's typed is lost.

---

## Put it on Dad's iPhone (one time)

**1. Turn on hosting (free, about 2 minutes, done on a computer):**

1. Go to the repo on GitHub → **Settings** → **Pages**.
2. Under *Build and deployment*, set **Source** to *Deploy from a branch*.
3. Set **Branch** to `main` and the folder to `/ (root)`, then tap **Save**.
4. After a minute the app is live at **https://dreamywizard2502.github.io/Drywall_Count/**

**2. Install it on the iPhone:**

1. Open that link in **Safari** (it has to be Safari).
2. Tap the **Share** button (the square with the arrow) → **Add to Home Screen** → **Add**.
3. From then on, open it from the **Drywall Count** icon on the Home Screen.

> ⚠️ Always use the Home Screen icon. Counts are saved inside the installed app. Counts made in a Safari tab are stored separately and won't show up there.

The first time it opens, tap **English** or **Español**. The first time he taps **Drop pin**, the iPhone asks to use his location. Tap **Allow**.

---

## How a count goes

| Step | What he does | How it's protected from mistakes |
|---|---|---|
| **Start** | Taps the big **START COUNT** button. | If an unfinished count exists, it asks whether to continue that one or start a new one. |
| **1. Job** | Builder/client name + address. **📍 Drop pin** uses GPS to save the exact spot and fill in the address. | **Next** stays grey until both fields are filled. Tapping it anyway shows what's missing. Builders he's used before show up as one-tap choices. |
| **2. Drywall** | One area at a time: name it (tap a quick choice or type), then pick drywall type, sheet size, and number of sheets. He can add more types and a note. | Counting fields don't appear until the area has a name. Only one area is open at a time. Duplicate names get numbered automatically ("Bedroom 2"). **Complete** asks three questions: *Are you sure?* → *Any notes?* → *Complete!* with **OK** or **Wait, I need to change something**. Finished areas have **Edit / Note / Delete** buttons in the corner. Delete asks first and can be undone. |
| **3. Screws** | Either *We are bringing screws* (type + boxes) or *The BUILDER is supplying the screws*. | Choosing "builder" asks him to confirm, then shows a big banner and prints **SUPPLIED BY BUILDER** in red on the sheet. A second screw type **requires a reason** and can be tied to areas. Same three-question check at the end. |
| **4. Job Site Check** | Standard ceiling height (8/9/10/Other) + any areas with a special height. Then scaffolding (stackable sections or pony scaffold, how many, and which areas), electricity (if none: generator or builder), water for mud (if none: who brings it), special features (rotunda, dome, curved wall, or typed in, tied to an area), bullnose, window wrap, and pre-rock (which areas). | Every question must be answered: open ones show a number, answered ones a ✓. If any area is over 10 ft and he answers "no scaffolding", it warns him. Same three-question check at the end. |
| **5. Count Sheet** | Sees the finished one-page sheet. **Go back and change something** lets him pick exactly which part to fix. | The sheet is read-only. Changing one part only re-checks that part, then returns straight to the sheet. Finished parts are locked until he taps **Change something here**. |
| **Send** | **Complete Count**, then the big blue **Send to Mom**. | Sending is the only thing left to do. Home shows a warning for any count that hasn't been sent yet. |

The **📄 Sheet** button at the top of every screen shows the count sheet as it fills in. It's the exact PDF that gets sent.

### Sending

Tapping **Send to Mom** opens the iPhone share sheet with the PDF attached and this text already filled in:

> This is the drywall count for Bob the Builder at 123 Sesame Street, Austin, TX 78701.
>
> 📍 Map pin: https://maps.google.com/?q=30.267153,-97.743057

He taps **Mom** at the top of the share sheet (or Messages), then the blue arrow. iPhones don't let any app send a text by itself, so those two taps are the minimum. Every count is also saved on the phone under **Past Counts**, where he can open or re-send it. **Save a copy to Files** puts the PDF in the Files app.

### Spanish

- **The app** switches with the 🌐 button at the top of every screen, or on the home screen and in Settings.
- **The count sheet and text message stay in English** by default, even when Dad works in Spanish. If he taps "Cocina" and "1/2" Normal", Mom's sheet says "Kitchen" and "1/2" Regular". The count sheet screen reminds him: *(La hoja está en inglés.)*
- To send the sheet in Spanish instead, go to **Settings → Count sheet & text message language → Español**.
- Things he types himself (notes, a custom area name) can't be translated without signal, so they go on the sheet exactly as typed.

### No signal

Everything works offline: counting, the PDF, saving, and sending (Messages sends it once he has signal again). The only thing that needs signal is turning the GPS pin into a street name. With no signal, the pin is still saved and the address box shows the GPS numbers, which he can type over.

The street-name lookup uses OpenStreetMap, which is free and needs no account. Google's address lookup needs a paid API key. The link that gets texted is a normal Google Maps link.

---

## Changing things

- **Quick-tap choices** (area names, drywall types, sheet sizes, screws, special features): edit `js/choices.js`, and add the Spanish name to the list at the bottom of `js/i18n.js`.
- **Wording**: screen text is written in English inside `t('…')`. The Spanish for each one is in `js/es.js`. `node tests/i18n-keys.mjs` lists any text that's missing its Spanish, and the test fails if anything is missing. Anything he types that isn't on a list is remembered as a choice for next time (clear it in Settings).
- **Settings in the app**: the recipient's name (for the "Send to ___" button), his name ("Counted by" on the sheet), and a company name for the top of the sheet.
- **After changing any file**, bump `VERSION` in `sw.js` (for example `drywall-count-v2`). Otherwise phones keep the old offline copy. The update arrives the next time he opens the app with signal.

## For developers

No build step: plain JavaScript modules with [Preact + htm](https://github.com/developit/htm) and [jsPDF](https://github.com/parallax/jsPDF), both copied into `vendor/` so the app works offline.

```
index.html          app shell
sw.js               offline cache (list every app file here)
js/model.js         data + every "is this done?" rule
js/state.js         saving to the phone, navigation
js/ui.js            pop-up questions, triple verification, inputs
js/sheet.js         one-page layout -> PDF and on-screen preview
js/i18n.js          English/Español switching + hot-choice words in both
js/es.js            Spanish for every piece of screen text
js/screens/*.js     one file per screen
tests/e2e.mjs       walks a whole count on a simulated iPhone
```

Run locally with `npm start` (http://localhost:8080). Run the end-to-end test with `npm test` (needs Playwright + Chromium). It goes through three counts: one in English, one fully offline, and one in Spanish (checking that Mom's sheet comes out in English). It also checks the PDF is one page and that every piece of text has Spanish. Screenshots and PDFs are saved to `tests/out/`.
