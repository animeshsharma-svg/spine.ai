import fs from 'node:fs';
import path from 'node:path';

export const RAW_DIR = path.join(process.cwd(), 'reports', 'raw');

// Anything the browser fetches that isn't an XHR/fetch is noise — fonts,
// images, analytics beacons. Dumping all of it is exactly what made the old
// report unreadable, so the capture never looks at it.
const isApiCall = (request) => ['xhr', 'fetch'].includes(request.resourceType());

// These carry live session credentials. The report gets published, so the
// value is swapped for a shell variable: the curl stays replayable once the
// reader exports the token, but the token itself is never in the document.
const SECRET_HEADERS = new Map([
  ['access-token', '$ACCESS_TOKEN'],
  ['lightspeed-token', '$LIGHTSPEED_TOKEN'],
  ['authorization', '$AUTHORIZATION'],
  ['cookie', '$COOKIE'],
]);

// Headers every browser sends that tell you nothing about why a call failed.
const BORING_HEADERS = new Set([
  'accept-encoding', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-mobile',
  'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site',
  'user-agent', 'connection', 'host', 'content-length',
]);

const MAX_BODY = 2000;

const truncate = (text) =>
  text && text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n… [truncated]` : text;

export function toCurl({ method, url, headers, postData }) {
  const parts = [`curl -X ${method} '${url}'`];
  for (const [name, value] of Object.entries(headers)) {
    parts.push(`  -H '${name}: ${value}'`);
  }
  if (postData) parts.push(`  --data '${postData.replace(/'/g, `'\\''`)}'`);
  return parts.join(' \\\n');
}

/**
 * Records only the API calls that actually failed, as replayable curl.
 * Returns a stop() that writes them out for the report builder.
 */
export function attachFailedRequestCapture(page, testInfo) {
  const failures = [];

  const record = async (request, { status, statusText, body, transportError }) => {
    if (!isApiCall(request)) return;

    const headers = {};
    for (const [name, value] of Object.entries(await request.allHeaders())) {
      const lower = name.toLowerCase();
      if (BORING_HEADERS.has(lower)) continue;
      headers[name] = SECRET_HEADERS.get(lower) ?? value;
    }

    failures.push({
      method: request.method(),
      url: request.url(),
      status,
      statusText,
      transportError,
      responseBody: truncate(body),
      curl: toCurl({ method: request.method(), url: request.url(), headers, postData: request.postData() }),
    });
  };

  const onResponse = async (response) => {
    if (response.status() < 400) return;
    let body;
    // A response body is not always still available (redirects, aborted
    // navigations) — a failed read must not take the whole run down.
    try { body = await response.text(); } catch { body = undefined; }
    await record(response.request(), {
      status: response.status(),
      statusText: response.statusText(),
      body,
    }).catch(() => {});
  };

  const onRequestFailed = async (request) => {
    await record(request, { transportError: request.failure()?.errorText ?? 'request failed' }).catch(() => {});
  };

  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  return async function stop() {
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
    if (!failures.length) return;
    fs.mkdirSync(RAW_DIR, { recursive: true });
    const safe = testInfo.titlePath.join(' › ').replace(/[^a-z0-9]+/gi, '_').slice(0, 120);
    fs.writeFileSync(
      path.join(RAW_DIR, `${safe}.json`),
      JSON.stringify({ test: testInfo.titlePath.join(' › '), file: testInfo.file, failures }, null, 2),
    );
  };
}
