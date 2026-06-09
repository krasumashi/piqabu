/**
 * GitHub Releases stats helper for Mission Control's Insights pane.
 *
 * Fetches APK download counts via GitHub's public API and caches the
 * result for 5 minutes so we don't burn rate limits (60 req/hour
 * unauthenticated, 5000/hour with a token). The dashboard polls
 * /admin/stats every 15s; the cache makes that fan-out cheap.
 *
 * Authentication: optional. If GITHUB_TOKEN env is set, attaches a
 * Bearer header so the rate limit jumps to 5000/h. Without it the
 * 60/h limit is plenty since we re-cache for 5min.
 *
 * Privacy: GitHub aggregates downloads server-side — what we see is a
 * single integer per asset, no IPs or user-agents. Matches Piqabu's
 * "aggregates only" analytics posture.
 */

const https = require('https');

const REPO_OWNER = process.env.GITHUB_RELEASES_OWNER || 'krasumashi';
const REPO_NAME = process.env.GITHUB_RELEASES_REPO || 'piqabu';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { at: 0, data: null };

function ghRequest(path) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'piqabu-mission-control',
            Accept: 'application/vnd.github+json',
        };
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }
        https.get({
            hostname: 'api.github.com',
            path,
            headers,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(raw)); }
                    catch (e) { reject(e); }
                } else if (res.statusCode === 404) {
                    // Repo or releases not yet created — zero counts is the
                    // right answer for the dashboard.
                    resolve([]);
                } else {
                    reject(new Error(`GitHub API ${path} -> ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Fetch download stats. Returns:
 *   {
 *     totalDownloads,           - sum across every asset, every release
 *     latestReleaseDownloads,   - sum of assets on the most recent release
 *     latestReleaseTag,         - e.g. "v0.1.0", or null if no releases yet
 *     releases: [               - per-release breakdown
 *       { tag, name, publishedAt, downloads }
 *     ]
 *   }
 */
async function fetchDownloadStats() {
    const now = Date.now();
    if (cache.data && now - cache.at < CACHE_TTL_MS) {
        return cache.data;
    }

    try {
        const releases = await ghRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=100`);
        if (!Array.isArray(releases)) {
            cache = { at: now, data: emptyStats() };
            return cache.data;
        }

        let totalDownloads = 0;
        let latestReleaseDownloads = 0;
        let latestReleaseTag = null;

        const perRelease = releases.map((r, idx) => {
            const dl = (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0);
            totalDownloads += dl;
            if (idx === 0) {
                latestReleaseDownloads = dl;
                latestReleaseTag = r.tag_name || null;
            }
            return {
                tag: r.tag_name,
                name: r.name,
                publishedAt: r.published_at,
                downloads: dl,
            };
        });

        const data = {
            totalDownloads,
            latestReleaseDownloads,
            latestReleaseTag,
            releases: perRelease,
        };
        cache = { at: now, data };
        return data;
    } catch (e) {
        console.warn('[GitHubReleases] fetch failed:', e.message);
        // Serve a stale cache if we have one, else empty.
        return cache.data || emptyStats();
    }
}

function emptyStats() {
    return {
        totalDownloads: 0,
        latestReleaseDownloads: 0,
        latestReleaseTag: null,
        releases: [],
    };
}

module.exports = { fetchDownloadStats };
