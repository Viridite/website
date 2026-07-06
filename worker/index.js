// Relays anonymous compat-report submissions from the website form into
// GitHub, without exposing a GitHub token to the browser and without ever
// touching GitHub's issue-form size limits (the whole reason this exists —
// see the website's submit.html and compat-reports' README for the full
// picture).
//
// Two request paths:
//   POST /apk-upload-url  -> returns a short-lived presigned R2 PUT URL.
//                            The browser uploads the APK bytes DIRECTLY to
//                            R2 with this — never through this Worker — so
//                            real ~100-150MB APKs aren't limited by either
//                            GitHub's Contents API (~30-40MB ceiling) or
//                            Cloudflare's own ~100MB request-body limit for
//                            requests that *do* hit a Worker.
//   POST /              -> the main submission: validates the fields, writes
//                            the logs/meta as plain files under
//                            compat-reports/pending/<id>/ via the Contents
//                            API (small text, no size problem), resolves an
//                            apk_object_key (if given) into a presigned R2
//                            GET URL and stores that as apk_url — so
//                            process_compat_submission.py doesn't need to
//                            know or care whether a link was pasted or a
//                            file was uploaded, it just downloads a URL
//                            either way — then fires a repository_dispatch
//                            on AndroidHorizonNX to kick off analysis.

const ALLOWED_ORIGIN = "https://androidhorizon.github.io";
const OWNER = "AndroidHorizon";
const REPORTS_REPO = "compat-reports";
const LAUNCHER_REPO = "AndroidHorizonNX";
const R2_BUCKET = "android-horizon-compat-uploads";
const R2_REGION = "auto";
const R2_SERVICE = "s3";

// Generous but not unbounded — these are plain text logs, not video files.
const MAX_LOG_BYTES = 4 * 1024 * 1024;      // 4MB per log
const MAX_FIELD_BYTES = 4096;               // apk_url / source_site / username / notes
// R2 (via a presigned PUT the browser uses directly) has no meaningful
// ceiling for this use case — capped generously above real APK sizes
// (~100-150MB is common) just to bound abuse, not because of a platform
// limit like the old GitHub-Contents-API-based upload had.
const MAX_APK_UPLOAD_BYTES = 300 * 1024 * 1024;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function byteLen(s) {
  return new TextEncoder().encode(s || "").length;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ------------------------------------------------------------- AWS SigV4 --
// R2 speaks the S3 API, which is how presigned URLs work here — hand-rolled
// with Web Crypto (no aws4fetch/SDK dependency, keeps this a single file
// with no build step). Query-string ("presigned URL") flavor of SigV4, per
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
// R2's equivalent docs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return hex(digest);
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

async function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

async function presignR2Url({ method, objectKey, expiresSeconds, accessKeyId, secretAccessKey, accountId }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;

  const canonicalUri = `/${R2_BUCKET}/${objectKey}`;
  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuerystring = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method, canonicalUri, canonicalQuerystring, canonicalHeaders, "host", "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, R2_REGION, R2_SERVICE);
  const signature = hex(await hmac(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
}

// --------------------------------------------------------------- GitHub --

async function ghPutRaw(token, path, base64Content, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPORTS_REPO}/contents/${path}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "android-horizon-compat-relay",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: base64Content, branch: "main" }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub write failed for ${path}: ${resp.status} ${text.slice(0, 300)}`);
  }
}

async function ghPut(token, path, contentStr, message) {
  return ghPutRaw(token, path, toBase64(contentStr), message);
}

async function ghDispatch(token, submissionId) {
  const url = `https://api.github.com/repos/${OWNER}/${LAUNCHER_REPO}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "android-horizon-compat-relay",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "compat-submission", client_payload: { submission_id: submissionId } }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`dispatch failed: ${resp.status} ${text.slice(0, 300)}`);
  }
}

// ------------------------------------------------------------------ /apk-upload-url --

async function handleUploadUrl(request, env) {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    return json(500, { ok: false, error: "Relay isn't configured (missing R2 credentials)" });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }
  const filename = (body.filename || "game.apk").replace(/[^A-Za-z0-9_.\-]/g, "_");
  const objectKey = `${crypto.randomUUID()}-${filename}`;

  const uploadUrl = await presignR2Url({
    method: "PUT",
    objectKey,
    expiresSeconds: 900, // 15 minutes — plenty for an upload to start and finish
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    accountId: env.CF_ACCOUNT_ID,
  });

  return json(200, { ok: true, upload_url: uploadUrl, object_key: objectKey });
}

// ------------------------------------------------------------------------ validation --

function validate(body) {
  const required = ["source_site", "launcher_log", "compat_log", "core_log"];
  for (const key of required) {
    if (!body[key] || typeof body[key] !== "string" || !body[key].trim()) {
      return `Missing required field: ${key}`;
    }
  }

  const hasUrl = !!(body.apk_url && body.apk_url.trim());
  const hasObjectKey = !!(body.apk_object_key && body.apk_object_key.trim());
  if (!hasUrl && !hasObjectKey) {
    return "Provide either an APK download link or an attached APK file";
  }
  if (hasUrl) {
    let apkUrl;
    try {
      apkUrl = new URL(body.apk_url);
    } catch {
      return "apk_url isn't a valid URL";
    }
    if (apkUrl.protocol !== "http:" && apkUrl.protocol !== "https:") {
      return "apk_url must be http(s)";
    }
  }

  for (const key of ["source_site", "github_username", "notes"]) {
    if (body[key] && byteLen(body[key]) > MAX_FIELD_BYTES) {
      return `${key} is too long`;
    }
  }
  for (const key of ["launcher_log", "compat_log", "core_log"]) {
    if (byteLen(body[key]) > MAX_LOG_BYTES) {
      return `${key} is too large (max ${MAX_LOG_BYTES / (1024 * 1024)}MB)`;
    }
  }
  return null;
}

// ------------------------------------------------------------------------------ main --

async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const validationError = validate(body);
  if (validationError) {
    return json(400, { ok: false, error: validationError });
  }
  if (!env.GH_TOKEN) {
    return json(500, { ok: false, error: "Relay isn't configured (missing GH_TOKEN secret)" });
  }

  const id = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const hasObjectKey = !!(body.apk_object_key && body.apk_object_key.trim());

  let apkUrl = body.apk_url ? body.apk_url.trim() : "";
  if (hasObjectKey) {
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      return json(500, { ok: false, error: "Relay isn't configured (missing R2 credentials)" });
    }
    // Long enough that GitHub Actions queue delay can never make this
    // expire before the workflow actually downloads it.
    apkUrl = await presignR2Url({
      method: "GET",
      objectKey: body.apk_object_key.trim(),
      expiresSeconds: 6 * 60 * 60,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      accountId: env.CF_ACCOUNT_ID,
    });
  }

  const meta = {
    apk_url: apkUrl,
    source_site: body.source_site.trim(),
    github_username: (body.github_username || "").trim(),
    notes: (body.notes || "").trim(),
    submitted_at: submittedAt,
  };

  try {
    await ghPut(env.GH_TOKEN, `pending/${id}/meta.json`, JSON.stringify(meta, null, 2),
      `Queue compat submission ${id}`);
    await ghPut(env.GH_TOKEN, `pending/${id}/launcher_log.txt`, body.launcher_log,
      `Queue compat submission ${id} (launcher log)`);
    await ghPut(env.GH_TOKEN, `pending/${id}/compat_log.txt`, body.compat_log,
      `Queue compat submission ${id} (compat log)`);
    await ghPut(env.GH_TOKEN, `pending/${id}/core_log.txt`, body.core_log,
      `Queue compat submission ${id} (core log)`);
    await ghDispatch(env.GH_TOKEN, id);
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  return json(200, { ok: true, id });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "POST only" });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/apk-upload-url") {
      return handleUploadUrl(request, env);
    }
    return handleSubmit(request, env);
  },
};
