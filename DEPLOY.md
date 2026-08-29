# Deploying investomillionaire.com

Three services, all on free tiers: the site on Vercel, the API on Render, the database on Atlas.
Budget about forty minutes end to end. DNS propagation is the only part you wait on.

## 1. Database on MongoDB Atlas

1. Sign up at [cloud.mongodb.com](https://cloud.mongodb.com) and create a free **M0** cluster. Pick the
   Mumbai region (`ap-south-1`) so queries do not cross an ocean.
2. Under **Database Access**, add a user. Let Atlas generate the password and copy it.
3. Under **Network Access**, add `0.0.0.0/0`. Render does not publish fixed egress IPs on the free tier,
   so a narrower rule will simply lock you out.
4. Hit **Connect → Drivers** and copy the connection string. It looks like:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/investomillionaire?retryWrites=true&w=majority
   ```

   Add `/investomillionaire` before the `?` if it is not already there. That is your `MONGODB_URI`.

## 2. Push the code to GitHub

```bash
cd ~/InvestoMillionaire
git init
git add .
git commit -m "InvestoMillionaire"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/investomillionaire.git
git push -u origin main
```

`.gitignore` already excludes `.env`, so no secret leaves your machine. Every secret gets set again
in the Render and Vercel dashboards.

## 3. API on Render

1. [render.com](https://render.com) → **New → Web Service** → connect the repo.
2. Settings:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free
3. Add environment variables. Generate fresh secrets, do not reuse the local ones:

   | Key | Value |
   | --- | --- |
   | `MONGODB_URI` | the Atlas string from step 1 |
   | `JWT_SECRET` | `openssl rand -hex 48` |
   | `FIELD_ENCRYPTION_KEY` | `openssl rand -hex 32` |
   | `ADMIN_TOKEN` | `openssl rand -hex 24` |
   | `CLIENT_ORIGIN` | `https://investomillionaire.com,https://www.investomillionaire.com` |
   | `RESEND_API_KEY` | the key from step 3a |
   | `MAIL_FROM` | `InvestoMillionaire <no-reply@investomillionaire.com>` |

4. Deploy, then note the URL Render gives you, something like `https://investomillionaire-api.onrender.com`.
   Check `https://that-url/api/health` returns `{"ok":true}`.

### 3a. Mail through Resend

Do not use Gmail SMTP here. Render blocks outbound traffic on ports 25, 465 and 587 for free
instances, so an SMTP connection hangs until it times out and signup dies with a 500. Resend sends
over HTTPS, which is not blocked.

1. [resend.com](https://resend.com) → create an account → **Domains → Add Domain** →
   `investomillionaire.com`.
2. Resend shows a handful of DNS records. Add them wherever the domain's nameservers live, the same
   place the Vercel records were set. Verification usually lands within the hour.
3. **API Keys → Create API Key**, sending permission only. Copy it once, Resend will not show it again.
4. Set `RESEND_API_KEY` and `MAIL_FROM` on Render. `MAIL_FROM` has to sit on the verified domain.
   A `gmail.com` sender gets a 403.
5. Check it end to end from your laptop: `cd server && node src/scripts/mailtest.js you@example.com`.

Leave `RESEND_API_KEY` blank in local development. The code is printed to the server log instead of
being emailed, and signup still works.

**Keep `FIELD_ENCRYPTION_KEY` backed up somewhere safe.** Lose it and every stored mobile number
becomes permanently unreadable. There is no recovery path, by design.

Free Render instances sleep after fifteen minutes idle and take roughly thirty seconds to wake. For a
learning site that is survivable. The paid tier removes it if the wait starts to annoy you.

## 4. Site on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → same repo.
2. Settings:
   - Root directory: `client`
   - Framework preset: Vite
   - Build command: `npm run build` (this also generates the per-route HTML, sitemap and robots.txt)
   - Output directory: `dist`
3. Environment variable:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://your-render-url.onrender.com/api` |

4. Deploy.

## 5. Point the domain

In Vercel, **Settings → Domains**, add `investomillionaire.com` and `www.investomillionaire.com`.
Vercel shows the records to create. At your registrar, add:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Use whatever values Vercel actually displays, since they change. Propagation usually takes fifteen
minutes to an hour. HTTPS is issued automatically once DNS resolves.

Set the redirect so one version is canonical. Vercel does this for you when you mark
`investomillionaire.com` as primary, and it matters for search: two reachable versions of the same
page split your ranking.

## 6. Search engines

1. [Google Search Console](https://search.google.com/search-console) → add `investomillionaire.com`
   as a **Domain** property, verify with the TXT record it gives you.
2. **Sitemaps** → submit `sitemap.xml`.
3. **URL Inspection** on the homepage → **Request indexing**. Do the same for two or three lesson pages.
4. Repeat at [Bing Webmaster Tools](https://www.bing.com/webmasters), which can import directly from
   Google Search Console in one click.

Indexing takes days to weeks. Nothing you do speeds it up much beyond submitting the sitemap.

## 7. Check the work

- **Rich results**: [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
  on a lesson URL. It should detect `LearningResource` and `EducationalOrganization`.
- **Link previews**: paste a lesson URL into [opengraph.xyz](https://www.opengraph.xyz), and into a
  WhatsApp chat with yourself. The card must show the title, description and logo.
- **Speed**: [pagespeed.web.dev](https://pagespeed.web.dev). The 3D bundle is heavy, so expect a lower
  mobile score than desktop. Code-splitting three.js is the fix when it starts to bother you.
- **Live data**: open `/ipo` and `/reco` on the real domain and confirm the cards fill. If they are
  empty, `VITE_API_URL` is wrong or `CLIENT_ORIGIN` on Render does not include your domain.

## Updating later

```bash
git add .
git commit -m "what changed"
git push
```

Vercel and Render both redeploy on push. The sitemap regenerates on every build, so new lessons show
up in search automatically.

## Adding a desk note in production

```bash
API_BASE=https://your-render-url.onrender.com/api \
ADMIN_TOKEN=your-render-admin-token \
npm run pick --prefix server
```
