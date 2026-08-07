// ─── Viridite Store ─────────────────────────────────────────────────────────
//
// Turns an APK into a forwarder NRO entirely in the browser. Nothing is
// uploaded: the APK is read with the File API, the forwarder stub is fetched
// from this site, and the result is assembled in memory and handed straight to
// a download. The page works offline once loaded, and a game nobody has the
// right to redistribute never leaves the machine it is already on.
//
// It produces exactly what the launcher's own forwarderWrite() produces — the
// stub NRO with an asset section appended (icon JPEG + NACP), named after the
// package. The launcher reads that filename back from argv[0], so the naming
// is load-bearing, not cosmetic.
//
// Deflate comes from DecompressionStream, which every current browser has, so
// there is no zip library to ship or keep patched.

// ── Zip ─────────────────────────────────────────────────────────────────────
//
// Read via the central directory rather than by walking local headers: local
// headers may carry zeroed sizes with the real ones in a trailing data
// descriptor, and the central directory always has them.

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;

export function readZip(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // The EOCD sits at the end, behind a comment of up to 64K.
  let eocd = -1;
  const from = Math.max(0, buf.byteLength - 66000);
  for (let i = buf.byteLength - 22; i >= from; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end-of-directory record).');

  let count = dv.getUint16(eocd + 10, true);
  let cenOff = dv.getUint32(eocd + 16, true);

  // Zip64, which APKs over 4GB or with >65535 entries use.
  if (cenOff === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= from; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD64_LOC) {
        const z64 = Number(dv.getBigUint64(i + 8, true));
        count  = Number(dv.getBigUint64(z64 + 32, true));
        cenOff = Number(dv.getBigUint64(z64 + 48, true));
        break;
      }
    }
  }

  const entries = new Map();
  let p = cenOff;
  for (let i = 0; i < count && p + 46 <= buf.byteLength; i++) {
    if (dv.getUint32(p, true) !== SIG_CEN) break;
    const method   = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const rawSize  = dv.getUint32(p + 24, true);
    const nameLen  = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen   = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compSize, rawSize, localOff });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return { dv, u8, entries };
}

export async function readEntry(zip, name) {
  const e = zip.entries.get(name);
  if (!e) return null;

  // The local header's own name/extra lengths are what tell us where the data
  // starts; the central directory's copies can differ in length.
  const lh = e.localOff;
  if (zip.dv.getUint32(lh, true) !== 0x04034b50) return null;
  const nameLen  = zip.dv.getUint16(lh + 26, true);
  const extraLen = zip.dv.getUint16(lh + 28, true);
  const start = lh + 30 + nameLen + extraLen;
  const raw = zip.u8.subarray(start, start + e.compSize);

  if (e.method === 0) return raw.slice();
  if (e.method !== 8) throw new Error(`Unsupported compression in ${name}.`);

  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([raw]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Android binary XML ──────────────────────────────────────────────────────
//
// Only what a manifest holds and only what a forwarder needs: the package
// name, the version name, and the <application> label and icon. Attribute
// values that are resource references come back as a numeric id, which is as
// far as this goes — resolving them means parsing resources.arsc, and the page
// lets the person fix the name by typing it instead, which is faster and
// always correct.

function parseStringPool(dv, off) {
  const count   = dv.getUint32(off + 8, true);
  const flags   = dv.getUint32(off + 16, true);
  const strStart = dv.getUint32(off + 20, true);
  const isUtf8  = (flags & (1 << 8)) !== 0;
  const strings = new Array(count);
  const dec = new TextDecoder(isUtf8 ? 'utf-8' : 'utf-16le');

  for (let i = 0; i < count; i++) {
    const so = off + strStart + dv.getUint32(off + 28 + i * 4, true);
    if (isUtf8) {
      // Two lengths — characters then bytes — each 1 or 2 bytes.
      let q = so;
      let n = dv.getUint8(q++); if (n & 0x80) n = ((n & 0x7f) << 8) | dv.getUint8(q++);
      let b = dv.getUint8(q++); if (b & 0x80) b = ((b & 0x7f) << 8) | dv.getUint8(q++);
      strings[i] = dec.decode(new Uint8Array(dv.buffer, q, b));
    } else {
      let q = so;
      let n = dv.getUint16(q, true); q += 2;
      if (n & 0x8000) { n = ((n & 0x7fff) << 16) | dv.getUint16(q, true); q += 2; }
      strings[i] = dec.decode(new Uint8Array(dv.buffer, q, n * 2));
    }
  }
  return strings;
}

const TYPE_REFERENCE = 0x01;
const TYPE_STRING    = 0x03;

export function parseManifest(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = { packageName: '', versionName: '', label: '', labelRes: 0, iconRes: 0 };

  let strings = [];
  let p = dv.getUint16(2, true);            // past the file header
  const end = bytes.byteLength;

  while (p + 8 <= end) {
    const type = dv.getUint16(p, true);
    const size = dv.getUint32(p + 4, true);
    if (size <= 0 || p + size > end) break;

    if (type === 0x0001) {
      strings = parseStringPool(dv, p);
    } else if (type === 0x0102) {           // START_ELEMENT
      // hdrSize already covers lineNumber and comment, so the body starts
      // straight at ns/name — counting those two again walks past the tag.
      const hdrSize   = dv.getUint16(p + 2, true);
      const body      = p + hdrSize;
      const nameIdx   = dv.getUint32(body + 4, true);
      const attrStart = dv.getUint16(body + 8, true);
      const attrSize  = dv.getUint16(body + 10, true);
      const attrCount = dv.getUint16(body + 12, true);
      const tag = strings[nameIdx] || '';

      for (let a = 0; a < attrCount; a++) {
        const ap = body + attrStart + a * attrSize;
        const attrName = strings[dv.getUint32(ap + 4, true)] || '';
        const rawIdx   = dv.getUint32(ap + 8, true);
        const dataType = dv.getUint8(ap + 15);
        const data     = dv.getUint32(ap + 16, true);

        const asString = () =>
          dataType === TYPE_STRING
            ? (strings[data] ?? '')
            : (rawIdx !== 0xffffffff ? (strings[rawIdx] ?? '') : '');

        if (tag === 'manifest') {
          if (attrName === 'package')     out.packageName = asString();
          if (attrName === 'versionName') out.versionName = asString();
        } else if (tag === 'application') {
          if (attrName === 'label') {
            if (dataType === TYPE_REFERENCE) out.labelRes = data;
            else out.label = asString();
          }
          if (attrName === 'icon' && dataType === TYPE_REFERENCE) out.iconRes = data;
        }
      }
    }
    p += size;
  }
  return out;
}

// ── Picking an icon ─────────────────────────────────────────────────────────
//
// Rather than resolving the icon's resource id through resources.arsc, take
// every plausible launcher icon in the zip and keep the one with the most
// pixels. The id would name one density; the biggest PNG is the one that
// actually looks right scaled to 256, which is what the NACP wants — and it
// keeps working on APKs whose resources are obfuscated.

const ICON_RE = /^res\/(mipmap|drawable)[^/]*\/(ic_launcher|ic_launcher_foreground|icon|app_icon)[^/]*\.png$/i;

export async function pickIcon(zip, onNote) {
  const names = [...zip.entries.keys()].filter(n => ICON_RE.test(n));
  if (!names.length) {
    // Adaptive-icon-only APKs keep the artwork under a different name; fall
    // back to any reasonably large PNG under res/.
    names.push(...[...zip.entries.keys()].filter(
      n => /^res\/.*\.png$/i.test(n) && zip.entries.get(n).rawSize > 8000));
  }
  if (!names.length) return null;

  // Try biggest-on-disk first; decoding every candidate on a big APK is slow
  // and the compressed size is a good proxy for the pixel count.
  names.sort((a, b) => zip.entries.get(b).rawSize - zip.entries.get(a).rawSize);

  // Decode a handful and score them. Size alone picks the splash screen on an
  // APK with obfuscated resource names — which is most of them — because a
  // 1080p splash is always bigger than a 192px icon. A launcher icon is
  // square; a splash almost never is, so squareness is the discriminator that
  // actually separates them.
  let best = null, bestScore = -1;
  for (const n of names.slice(0, 8)) {
    try {
      const png = await readEntry(zip, n);
      if (!png) continue;
      const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      if (bmp.width < 48) continue;
      const ratio = Math.min(bmp.width, bmp.height) / Math.max(bmp.width, bmp.height);
      if (ratio < 0.9) continue;                     // not an icon shape
      const score = ratio * 1000 + Math.min(bmp.width, 512);
      if (score > bestScore) { bestScore = score; best = { bmp, n }; }
    } catch { /* try the next candidate */ }
  }
  if (best) {
    onNote?.(`icon from ${best.n} (${best.bmp.width}×${best.bmp.height})`);
    return best.bmp;
  }
  return null;
}

// The NACP wants a 256×256 JPEG. Anything smaller is scaled up rather than
// refused — a slightly soft icon beats no icon in the HOME menu.
export async function iconToJpeg(bitmap) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, 256, 256);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  return new Uint8Array(await blob.arrayBuffer());
}

// ── NACP ────────────────────────────────────────────────────────────────────
//
// 0x4000 bytes. lang[16] at 0, each 0x300 (name 0x200 then author 0x100);
// display_version at 0x3060, 0x10 bytes. Offsets taken from libnx's own
// NacpStruct, the same header the launcher builds against.

const NACP_SIZE = 0x4000;

function putStr(view, off, cap, text) {
  const b = new TextEncoder().encode(text);
  const n = Math.min(b.length, cap - 1);      // always NUL-terminated
  for (let i = 0; i < n; i++) view[off + i] = b[i];
}

export function buildNacp({ title, author, version }) {
  const n = new Uint8Array(NACP_SIZE);
  // Every language, so the entry reads correctly whatever the console is set
  // to instead of falling back to a blank name.
  for (let i = 0; i < 16; i++) {
    putStr(n, i * 0x300,         0x200, title);
    putStr(n, i * 0x300 + 0x200, 0x100, author);
  }
  putStr(n, 0x3060, 0x10, version);
  return n;
}

// ── The forwarder ───────────────────────────────────────────────────────────

export function buildForwarder(stub, icon, nacp) {
  const dv = new DataView(stub.buffer, stub.byteOffset, stub.byteLength);
  if (String.fromCharCode(...stub.subarray(0x10, 0x14)) !== 'NRO0')
    throw new Error('The forwarder stub is not an NRO.');

  // The stub ships without assets, so its header size is the whole file. Trim
  // past it regardless, so re-stamping an already-stamped binary can never
  // append a second asset section.
  const nroSize = dv.getUint32(0x18, true);
  if (!nroSize || nroSize > stub.byteLength)
    throw new Error('The forwarder stub has a bad size field.');
  const body = stub.subarray(0, nroSize);

  const HDR = 0x38;
  const hdr = new Uint8Array(HDR);
  const hv = new DataView(hdr.buffer);
  hdr.set(new TextEncoder().encode('ASET'), 0);
  hv.setUint32(4, 0, true);                                  // version

  let off = HDR;
  if (icon) { hv.setBigUint64(8,  BigInt(off), true); hv.setBigUint64(16, BigInt(icon.length), true); off += icon.length; }
  hv.setBigUint64(24, BigInt(off), true);                    // nacp offset
  hv.setBigUint64(32, BigInt(nacp.length), true);
  off += nacp.length;
  hv.setBigUint64(40, BigInt(off), true);                    // romfs offset
  hv.setBigUint64(48, 0n, true);                             // romfs size

  const parts = icon ? [body, hdr, icon, nacp] : [body, hdr, nacp];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let q = 0;
  for (const p of parts) { out.set(p, q); q += p.length; }
  return out;
}

// ── Guessing name and author from the package ───────────────────────────────
//
// Mirrors the launcher's own forwarderAuthor(): reverse-DNS packages put the
// vendor second, so com.fingersoft.hillclimb credits Fingersoft. Not universal,
// but right for every game Viridite runs, and a wrong guess shows as a slightly
// odd author line rather than a failure.
//
// These matter because the page cannot resolve resources.arsc, so the label is
// usually a bare resource id. A sensible default that the person then corrects
// beats an empty box, and beats the last package component — which for
// com.sonicrunners.beta is "beta".

const GENERIC = new Set([
  'beta', 'alpha', 'android', 'app', 'game', 'games', 'free', 'lite', 'full',
  'mobile', 'hd', 'release', 'prod', 'main', 'client', 'gp', 'play', 'demo',
]);

function titleCase(s) {
  return s.replace(/[_-]+/g, ' ')
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')     // camelCase → two words
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b[a-z]/g, c => c.toUpperCase());
}

export function guessTitle(pkg) {
  const parts = pkg.split('.').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!GENERIC.has(parts[i].toLowerCase())) return titleCase(parts[i]);
  }
  return titleCase(parts[parts.length - 1] || pkg);
}

export function guessAuthor(pkg) {
  const parts = pkg.split('.').filter(Boolean);
  const dev = parts.length > 1 ? titleCase(parts[1]) : '';
  return dev ? `${dev} | Viridite Contributors` : 'Viridite Contributors';
}

// ── Pre-installing ──────────────────────────────────────────────────────────
//
// The slow first launch is the Core unzipping the APK into
// sdmc:/Viridite/games/<pkg>/ — libs flattened out of lib/arm64-v8a/, assets/
// copied with their paths, then a .installed marker. It is cached: every later
// launch skips it. So the wait is a one-off, and it is one a browser can do
// instead, on a machine with a real CPU and no 100MHz SD card in the way.
//
// This produces that folder as a zip to drop on the card. It deliberately does
// NOT go inside the NRO: extracted game data is bigger than the APK it came
// from (that is what decompressing means), hbloader loads an NRO wholly into
// memory, and a 100MB NRO does not load. Packaging the install into the
// forwarder would make the download larger and the forwarder unloadable.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const s = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Minimal zip writer. Deflate where it pays, stored where it does not — the
// .so files and Unity's asset bundles are already compressed, and running them
// through deflate again costs seconds to save nothing.
export async function makeZip(files, onProgress) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    let body = f.data, method = 0;
    if (f.data.length > 512) {
      const z = await deflateRaw(f.data);
      if (z.length < f.data.length * 0.95) { body = z; method = 8; }
    }

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);              // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    chunks.push(lh, body);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);

    offset += lh.length + body.length;
    onProgress?.(i + 1, files.length, f.name);
  }

  const cenStart = offset;
  let cenSize = 0;
  for (const c of central) { chunks.push(c); cenSize += c.length; }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, cenStart, true);
  chunks.push(eocd);

  return new Blob(chunks, { type: 'application/zip' });
}

// Everything the Core would have extracted, in the layout it expects.
export async function buildInstall(zip, pkg, onProgress) {
  const out = [];
  const names = [...zip.entries.keys()];

  // 64-bit only. The Core runs 32-bit titles through the x64 Core's ARM32
  // layer, so armeabi-v7a is never what gets loaded on this path.
  const libs = names.filter(n => n.startsWith('lib/arm64-v8a/') && n.endsWith('.so'));
  const assets = names.filter(n => n.startsWith('assets/') && !n.endsWith('/'));
  if (!libs.length) throw new Error('No lib/arm64-v8a/*.so in this APK — nothing to pre-install.');

  const total = libs.length + assets.length;
  let done = 0;

  for (const n of libs) {
    const data = await readEntry(zip, n);
    if (data) out.push({ name: `${pkg}/lib/${n.split('/').pop()}`, data });
    onProgress?.(++done, total, n);
  }
  for (const n of assets) {
    const data = await readEntry(zip, n);
    if (data) out.push({ name: `${pkg}/assets/${n.slice('assets/'.length)}`, data });
    onProgress?.(++done, total, n);
  }

  // The marker the Core checks to skip extraction. It records the APK this
  // install came from, which is what the Core compares against.
  out.push({
    name: `${pkg}/.installed`,
    data: new TextEncoder().encode(`sdmc:/Viridite/apks/${pkg}.apk`),
  });
  return out;
}
