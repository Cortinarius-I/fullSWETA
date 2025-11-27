# SWETA v3.0

**Shitty Work Executive Tracking Assistant**

A K-pop themed PWA that tracks your work with hourly check-ins

## 🏗️ Architecture

```
┌─────────────────┐     Subscribe      ┌─────────────────┐
│   SWETA PWA     │ ──────────────────▶│  Google Sheets  │
│   (Your Phone)  │                    │  + Apps Script  │
└─────────────────┘                    └────────┬────────┘
        ▲                                       │
        │                                       │ Every 15 min
        │ Push Notification                     ▼
        │                              ┌─────────────────┐
        └──────────────────────────────│  Cloudflare     │
                                       │  Worker (FREE)  │
                                       └─────────────────┘
```

**Total Cost: $0** 🎉

## 📋 Setup Guide

### Step 1: Deploy Cloudflare Worker

1. **Create Cloudflare Account**
   - Go to [workers.cloudflare.com](https://workers.cloudflare.com)
   - Sign up for free

2. **Create New Worker**
   - Click "Create a Service"
   - Name it `sweta-push`
   - Click "Create Service"

3. **Add the Code**
   - Click "Quick Edit"
   - Delete the default code
   - Copy entire contents of `cloudflare-worker.js`
   - Paste into the editor
   - **IMPORTANT**: Update `VAPID_SUBJECT` to your email!
   - Click "Save and Deploy"

4. **Note Your Worker URL**
   - It will be like: `https://sweta-push.YOUR-SUBDOMAIN.workers.dev`
   - Copy this URL - you'll need it for Google Apps Script

### Step 2: Set Up Google Sheets (10 minutes)

1. **Create Google Sheet**
   - Go to [sheets.google.com](https://sheets.google.com)
   - Create a new blank spreadsheet
   - Name it "SWETA Work Log"

2. **Open Apps Script**
   - Go to Extensions → Apps Script
   - Delete any default code

3. **Add the Script**
   - Copy entire contents of `Code.gs`
   - Paste into the editor
   - **IMPORTANT**: Update `CLOUDFLARE_WORKER_URL` to your worker URL!

4. **Deploy as Web App**
   - Click "Deploy" → "New deployment"
   - Type: "Web app"
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Click "Deploy"
   - **Authorize** when prompted
   - Copy the Web App URL

5. **Set Up Hourly Trigger**
   - In Apps Script, run the function `setupHourlyTrigger`
   - Click the Run button (▶) while `setupHourlyTrigger` is selected
   - Authorize when prompted
   - This creates a trigger that runs every 15 minutes

### Step 3: Deploy the PWA (5 minutes)

1. **Upload to GitHub**
   - Create a new repository
   - Upload these files:
     - `index.html`
     - `sw.js`
     - `manifest.json`
     - All `icon-*.png` files

2. **Enable GitHub Pages**
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: main, folder: / (root)
   - Save

3. **Access Your App**
   - Wait 1-2 minutes for deployment
   - Go to `https://YOUR-USERNAME.github.io/YOUR-REPO/`

### Step 4: First-Time Setup in App

1. **Open the App** on your phone (Chrome recommended)
2. **Complete Setup**:
   - Enter your name
   - Create a security question
   - Paste your Google Apps Script Web App URL
3. **Enable Push Notifications**
   - Tap the notification banner or go to Settings
   - Tap "Enable Push Notifications"
   - Allow when prompted
4. **Test Notifications**
   - Go to Settings
   - Tap "Start Test Mode"
   - You should receive notifications every 15 seconds
   - Tap "Stop Test Mode" when done (clears test messages)

5. **Install as PWA** (recommended)
   - Chrome will show an install banner
   - Or tap menu → "Add to Home Screen"

## 🧪 Testing Your Setup

1. Enable push notifications in the app
2. **Fully close the app** (swipe it away)
3. Wait for the next scheduled check-in time
4. You should receive a notification even though the app is closed!

### Manually Trigger from Google Sheets

1. Open your Google Sheet
2. Go to Extensions → Apps Script
3. Select `testSendNotification` function
4. Click Run (▶)
5. You should receive a test notification

## 🔔 Notification Schedule

| Time | Message |
|------|---------|
| Start Time | Good morning greeting |
| Every [interval] min | Hourly check-in |
| Sunday 12 PM | Sunday greeting |

## ⚙️ Configuration

### In the App (Settings)

- **Working Hours**: When to send notifications (default: 8:30 AM - 9:30 PM)
- **Interval**: Minutes between check-ins (default: 60)
- **Target Hours**: Monthly goal (default: 175)

### In Google Apps Script

- **CLOUDFLARE_WORKER_URL**: Your Cloudflare Worker URL
- **Trigger Frequency**: Default is every 15 minutes (can be changed in `setupHourlyTrigger`)

### In Cloudflare Worker

- **VAPID_PUBLIC_KEY**: Already set, don't change unless regenerating
- **VAPID_PRIVATE_KEY**: Already set, keep secret!
- **VAPID_SUBJECT**: Your email (for push service identification)

## 📊 Google Sheets Structure

### Main User Sheet (one per user)
| Timestamp | Date | Time Slot | Work Done | Duration (min) | Logged At |
|-----------|------|-----------|-----------|----------------|-----------|

### _Subscriptions Sheet (auto-created)
| User Name | Subscription | Start Time | End Time | Interval | Timezone | Updated At |
|-----------|--------------|------------|----------|----------|----------|------------|

## 🛠️ Troubleshooting

### Notifications not working in background?

1. **Check subscription is saved**: 
   - Open your Google Sheet
   - Look for `_Subscriptions` sheet
   - Your entry should be there

2. **Check trigger is running**:
   - In Apps Script, go to Triggers (clock icon on left)
   - You should see `runScheduledCheck` running every 15 minutes

3. **Check Cloudflare Worker**:
   - Visit `https://your-worker.workers.dev/health`
   - Should show `{"status":"ok"}`

4. **Check browser permissions**:
   - On Android: Settings → Apps → Chrome → Notifications → Enable
   - Make sure battery optimization is disabled for Chrome

### Test mode not sending notifications?

1. Make sure you allowed notification permission
2. Check browser console for errors (F12 → Console)
3. Try the manual test in Google Apps Script

### Push subscription failing?

1. Make sure you're on HTTPS (GitHub Pages provides this)
2. Try clearing site data and re-subscribing
3. Check that service worker is registered (DevTools → Application → Service Workers)

## 🔑 Generating New VAPID Keys

If you need fresh keys (e.g., for security):

```bash
npm install web-push -g
web-push generate-vapid-keys
```

Then update:
1. `VAPID_PUBLIC_KEY` in both `index.html` AND `cloudflare-worker.js`
2. `VAPID_PRIVATE_KEY` in `cloudflare-worker.js` only

## 📱 Supported Platforms

| Platform | Background Notifications |
|----------|-------------------------|
| Android Chrome | ✅ Full support |
| Android Firefox | ✅ Full support |
| iOS Safari | ⚠️ Limited (iOS 16.4+, must be installed PWA) |
| Desktop Chrome | ✅ Full support |
| Desktop Firefox | ✅ Full support |
| Desktop Safari | ⚠️ Limited |

## 🆓 Free Tier Limits

| Service | Limit | SWETA Usage |
|---------|-------|-------------|
| Cloudflare Workers | 100,000 requests/day | ~100/day per user |
| Google Apps Script | 90 min/day runtime | ~5 min/day |
| GitHub Pages | 100GB bandwidth/month | Minimal |

You'd need 1000+ active users to approach any limits!

## 📄 Files Included

- `index.html` - Main PWA application
- `sw.js` - Service Worker with push handling
- `manifest.json` - PWA manifest
- `Code.gs` - Google Apps Script backend
- `cloudflare-worker.js` - Push notification sender
- `icon-*.png` - App icons (10 sizes)
- `README.md` - This file

화이팅! 💪
