// Resolves the newest downloadable Viridite build.
//
// GitHub's own "latest release" shortcuts are unusable here: every Viridite
// release is published as a prerelease, and both /releases/latest and
// /releases/latest/download/<asset> ignore prereleases — they 404. So the tag
// has to be resolved from the release list at request time.
//
// Mirrors what the launcher's own updater does (source/update.cpp): pick the
// HIGHEST VERSION among the entries rather than trusting list position, and
// read each release's asset URL from within that release's own object so a URL
// can never be attributed to a neighbouring tag.
//
// Resolves to { tag, assetUrl, size } or null if GitHub couldn't be reached
// (its anonymous API allows 60 requests/hour per IP, so this does fail in
// normal use and every caller must cope with null).
(function (global) {
  var API = "https://api.github.com/repos/Viridite/Viridite/releases?per_page=10";
  var ASSET = "Viridite-sdcard.zip";
  var cached = null;

  function versionOf(tag) {
    var nums = String(tag || "").match(/\d+/g) || [];
    return [0, 1, 2].map(function (i) { return parseInt(nums[i], 10) || 0; });
  }

  function isNewer(a, b) {
    var x = versionOf(a), y = versionOf(b);
    for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  }

  global.viriditeLatestRelease = function () {
    if (cached) return cached;
    cached = fetch(API)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (list) {
        if (!Array.isArray(list)) return null;
        var best = null;
        list.forEach(function (rel) {
          if (!rel || !rel.tag_name || !Array.isArray(rel.assets)) return;
          var asset = rel.assets.filter(function (a) { return a.name === ASSET; })[0];
          if (!asset) return;                       // no bundle: not installable
          if (best && !isNewer(rel.tag_name, best.tag)) return;
          best = {
            tag: rel.tag_name,
            assetUrl: asset.browser_download_url,
            size: asset.size || 0
          };
        });
        return best;
      })
      .catch(function () { return null; });
    return cached;
  };

  // Repoints any element carrying data-latest-download at the resolved asset,
  // so a page only has to mark its button up rather than repeat this logic.
  // The markup keeps a working href (the releases page) as the fallback that
  // stands if GitHub is unreachable.
  global.viriditeWireDownloadLinks = function () {
    var els = document.querySelectorAll("[data-latest-download]");
    if (!els.length) return;
    global.viriditeLatestRelease().then(function (rel) {
      if (!rel || !rel.assetUrl) return;            // leave the fallback href
      els.forEach(function (el) {
        el.href = rel.assetUrl;
        el.setAttribute("download", "");
        if (el.hasAttribute("data-latest-label")) {
          el.textContent = el.getAttribute("data-latest-label").replace("%s", rel.tag);
        }
      });
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", global.viriditeWireDownloadLinks);
  } else {
    global.viriditeWireDownloadLinks();
  }
})(window);
