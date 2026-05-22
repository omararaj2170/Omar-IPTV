# Omar-IPTV
This is the official repo For Omar-IPTV.

# Here we have 10000 Channels and we have a link to watch our iptv for FREE

# Links 
https://omararaj2170.github.io/Omar-IPTV/

# For Your IPTV player
https://raw.githubusercontent.com/omararaj2170/Omar-IPTV/refs/heads/main/m3u/playlist.m3u

# Contribuitors

omararaj2170

©️ 2026 Omar Araj. All rights reserved.



## Project structure
- `app/index/` → redirect page (`index.html`, `index.css`, `index.js`)
- `app/desktop/` → desktop player (`desktop.html`, `desktop.css`, `desktop.js`)
- `app/mobile/` → mobile player (`mobile.html`, `mobile.css`, `mobile.js`)
- `app/login/` → login/signup (`login.html`, `login.css`, `login.js`)
- `app/tv/` → TV player (`tv.html`, `tv.css`, `tv.js`)
- `m3u/playlist.m3u` → channel playlist


## Legacy entry files
Root files (`index.html`, `Desktop.html`, `mobile.html`, `login.html`, `tv.html`) are kept as lightweight redirects to the new `app/*/*.html` pages for compatibility.

## Optional live recap AI
- Uses OpenAI Chat Completions directly from the browser (user-provided API key).
- Key is kept in-memory unless you export/import an encrypted `.eync` file.

- You can export your key to an encrypted `.eync` file (AES-GCM + passphrase). Keep this file private and out of git.
- Bundled encrypted key file: `app/shared/bundled-key.eync` (passphrase: `omar-default-passphrase`).
