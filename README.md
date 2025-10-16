# okobserver-proxy

Cloudflare Worker that proxies a safe subset of WordPress REST API endpoints
from okobserver.org with permissive CORS. Deploy with `wrangler`.

## Quick start
1. Install wrangler: https://developers.cloudflare.com/workers/wrangler/install-and-update/
2. Authenticate: `wrangler login`
3. Publish: `wrangler deploy`
4. Note the workers.dev URL it prints (e.g. https://okobserver-proxy.<acct>.workers.dev)
5. In your site, set the API base to: `<workers.dev URL>/wp/v2`

Allowed endpoints: /posts, /media, /categories, /pages, /users.
