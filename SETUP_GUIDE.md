# 🚀 ZT Prospects Tournament Finder — Setup Guide
### Get your live app running in about 15 minutes. No coding required.

---

## What you'll need
- A computer (Mac or Windows, either works)
- An email address
- That's it!

---

## STEP 1 — Create a free GitHub account
GitHub is where your app's code will be stored.

1. Go to **https://github.com**
2. Click **"Sign up"**
3. Enter your email, create a password, pick a username (e.g. `ztprospects`)
4. Verify your email when they send you a confirmation

---

## STEP 2 — Create a new repository on GitHub
A "repository" (or "repo") is just a folder on GitHub that holds your app.

1. Once logged into GitHub, click the **"+"** button in the top-right corner
2. Click **"New repository"**
3. Name it: `zt-prospects-finder`
4. Make sure it's set to **Public**
5. Click **"Create repository"**
6. You'll see a mostly empty page — that's fine, leave this tab open

---

## STEP 3 — Upload your app files to GitHub

1. On the empty repository page, click **"uploading an existing file"** (it's a link in the middle of the page)
2. Drag and drop ALL the files from the `zt-prospects` folder I gave you:
   - `server.js`
   - `scraper.js`
   - `package.json`
   - `Procfile`
   - `.gitignore`
   - The `public` folder (drag the whole folder)
   - The `data` folder (drag the whole folder)
3. Scroll down and click **"Commit changes"**
4. Your files are now on GitHub! ✅

---

## STEP 4 — Create a free Railway account
Railway is the hosting service that will run your app 24/7.

1. Go to **https://railway.app**
2. Click **"Login"**
3. Click **"Login with GitHub"** — this connects Railway to your GitHub automatically
4. Authorize Railway when it asks

---

## STEP 5 — Deploy your app on Railway

1. Once logged into Railway, click **"New Project"**
2. Click **"Deploy from GitHub repo"**
3. You should see `zt-prospects-finder` in the list — click it
4. Railway will start building your app automatically (takes 1-2 minutes)
5. You'll see logs scrolling — that's normal, it's installing everything

---

## STEP 6 — Get your live URL

1. Once the build is done, click on your project
2. Click **"Settings"** tab
3. Under **"Domains"**, click **"Generate Domain"**
4. Railway will give you a URL like: `zt-prospects-finder.up.railway.app`
5. **Click that URL** — your app is live! 🎉

---

## STEP 7 — Set your secret admin key (optional but recommended)

Your app has a secret key that lets you manually trigger data refreshes.
The default key is `ztprospects2025` — you can change it:

1. In Railway, click your project
2. Click **"Variables"** tab
3. Click **"Add Variable"**
4. Name: `ADMIN_KEY`  Value: (pick any password you want)
5. Click **"Add"**

---

## How the app works once live

- **On startup**: The app immediately tries to pull real tournament data from USSSA, Perfect Game, GMB, Ripken, Game7, and PlayLocal
- **Every day at 3 AM**: It automatically refreshes all data
- **If a site blocks the scraper**: It keeps showing the last good data it found
- **Status bar**: The green dot at the top of your app tells you when data was last updated

---

## Sharing with other coaches

Just send them your Railway URL! They can use it from any phone or computer, no install needed.

---

## Manually triggering a data refresh

If you want to force a fresh data pull at any time:
1. Open your browser
2. Go to: `https://YOUR-URL.up.railway.app/api/refresh`
3. In the browser address bar, that won't work directly — you'll need to use a tool called Postman, or just wait for the daily refresh

(Easier option: just contact me and I can add a "Refresh Now" button to the app!)

---

## Troubleshooting

**The app loads but shows no tournaments:**
- Wait 5-10 minutes after first deploy for the initial scrape to run
- The app will fall back to demo data if scraping fails

**Railway says "Build failed":**
- Make sure all files were uploaded correctly in Step 3
- Check that `package.json` is in the root folder (not inside another folder)

**A specific association's data is missing:**
- That site may have blocked the scraper or changed their website layout
- Contact me and I can update the scraper code for that site

---

## Costs

- **GitHub**: Free forever
- **Railway**: Free tier includes 500 hours/month (~$5/month after that)
- For a simple app like this, you'll likely stay within the free tier

---

*Built for ZT Prospects by Claude (Anthropic) · Questions? Come back to Claude.ai and ask!*
