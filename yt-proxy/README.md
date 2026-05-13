# yt-proxy

Personal YouTube audio extractor. EchoNest's iPhone PWA hits this so YouTube songs play as HTML5 audio → background play works on locked screen.

## Deploy to Fly.io (one-time)

1. **Sign up** at https://fly.io/app/sign-up (free, no credit card needed for trial — they may ask later)

2. **Install flyctl** on your laptop:
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

3. **Login**:
   ```powershell
   fly auth login
   ```

4. **From this folder**:
   ```powershell
   cd yt-proxy
   fly launch --copy-config --no-deploy
   ```
   - When asked for app name, accept the default or change it (something like `echonest-yt-proxy-krishna`)
   - When asked to set up Postgres, say **No**
   - When asked to deploy now, say **No** (we need to set the secret first)

5. **Set the shared secret** — pick any long random string:
   ```powershell
   fly secrets set SHARED_SECRET="<your-long-random-string-here>"
   fly secrets set ALLOWED_ORIGIN="https://echonest-app.vercel.app"
   ```

6. **Deploy**:
   ```powershell
   fly deploy
   ```

7. **Note your URL** — Fly will give you `https://<your-app-name>.fly.dev`

8. **Add to Vercel env vars** on your echonest app:
   - `NEXT_PUBLIC_YT_PROXY_URL` = `https://<your-app-name>.fly.dev`
   - `YT_PROXY_SECRET` = same secret you set above

## Update yt-dlp later (when YouTube breaks it)

```powershell
cd yt-proxy
fly deploy
```
The Dockerfile pulls latest yt-dlp on each build.

## Test the deployed proxy

```powershell
curl https://<your-app-name>.fly.dev/health
# {"ok":true,"ts":...}

# Try fetching audio (replace VIDEO_ID + SECRET):
curl -H "Authorization: Bearer YOUR_SECRET" `
  "https://<your-app-name>.fly.dev/audio/rtOvBOTyX00" `
  -o test.m4a
```
