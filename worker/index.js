// Relays anonymous compat-report submissions from the website form into
// GitHub, without exposing a GitHub token to the browser and without ever
// touching GitHub's issue-form size limits (the whole reason this exists —
// see the website's submit.html and compat-reports' README for the full
// picture).
//
// Flow: validate the submission -> write it as plain files under
// compat-reports/pending/<id>/ via the Contents API -> fire a
// repository_dispatch on AndroidHorizonNX so its existing Action picks the
// submission up, runs the same download/analyze/publish pipeline, and
// deletes the pending/ entry when done.

const ALLOWED_ORIGIN = "https://androidhorizon.github.io";
const OWNER = "AndroidHorizon";
const REPORTS_REPO = "compat-reports";
const LAUNCHER_REPO = "AndroidHorizonNX";

// Generous but not unbounded — these are plain text logs, not video files.
const MAX_LOG_BYTES = 4 * 1024 * 1024;      // 4MB per log
const MAX_FIELD_BYTES = 4096;               // apk_url / source_site / username / notes
// GitHub's Contents API write endpoint rejects anything much past ~25-30MB
// (empirically confirmed: 25MB succeeded, 40MB got a hard 422 "too large").
// 20MB leaves real headroom under that ceiling for base64 overhead (+33%)
// and covers this project's actual target — small, old, simple 2D games —
// comfortably. Anything bigger needs a direct download link instead.
const MAX_APK_FILE_BYTES = 20 * 1024 * 1024;

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
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: "main",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub write failed for ${path}: ${resp.status} ${text.slice(0, 300)}`);
  }
}

// Text content (logs, meta.json) — base64-encodes it here.
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
    body: JSON.stringify({
      event_type: "compat-submission",
      client_payload: { submission_id: submissionId },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`dispatch failed: ${resp.status} ${text.slice(0, 300)}`);
  }
}

function validate(body) {
  const required = ["source_site", "launcher_log", "compat_log", "core_log"];
  for (const key of required) {
    if (!body[key] || typeof body[key] !== "string" || !body[key].trim()) {
      return `Missing required field: ${key}`;
    }
  }

  const hasUrl = !!(body.apk_url && body.apk_url.trim());
  const hasFile = !!(body.apk_file_base64 && body.apk_file_base64.trim());
  if (!hasUrl && !hasFile) {
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
  if (hasFile) {
    if (!body.apk_filename || typeof body.apk_filename !== "string") {
      return "Missing apk_filename for the attached file";
    }
    // Rough decoded-size estimate from the base64 string length (base64 is
    // ~4/3 the size of the original bytes) — good enough for a size gate,
    // no need to actually decode it just to measure it.
    const approxBytes = (body.apk_file_base64.length * 3) / 4;
    if (approxBytes > MAX_APK_FILE_BYTES) {
      return `Attached APK is too large (max ${MAX_APK_FILE_BYTES / (1024 * 1024)}MB — use a download link instead)`;
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "POST only" });
    }

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
    const hasFile = !!(body.apk_file_base64 && body.apk_file_base64.trim());
    const meta = {
      apk_url: hasFile ? "" : body.apk_url.trim(),
      apk_uploaded: hasFile,
      apk_filename: hasFile ? body.apk_filename : "",
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
      if (hasFile) {
        // Already base64 from the browser — pass straight through, no
        // re-encoding (that would double-encode and corrupt it).
        await ghPutRaw(env.GH_TOKEN, `pending/${id}/game.apk`, body.apk_file_base64.trim(),
          `Queue compat submission ${id} (uploaded APK)`);
      }
      await ghDispatch(env.GH_TOKEN, id);
    } catch (e) {
      return json(502, { ok: false, error: String(e.message || e) });
    }

    return json(200, { ok: true, id });
  },
};
