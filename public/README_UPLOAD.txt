EDUSEND PWA FIX - ROOT ICON VERSION

Upload these files directly into GitHub /public and replace files with the same names.
Do NOT put the PNG files into an icons folder for this version.

Required files in /public:
- index.html
- pwa.js
- service-worker.js
- manifest.webmanifest
- manifest.json
- icon-192.png
- icon-512.png
- apple-touch-icon.png

After committing:
1. Render -> Manual Deploy -> Deploy latest commit.
2. On Android Chrome, remove old EduSend shortcuts.
3. Chrome Settings -> Site settings -> Storage (or clear site data for the EduSend site) if the old icon persists.
4. Reopen the live EduSend URL and wait several seconds.
5. Chrome menu should offer Install app, or the page should show Install EduSend.
