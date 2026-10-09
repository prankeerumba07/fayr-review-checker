// Looking at a screenshot's pixels: a fingerprint to find the same screenshot
// given twice, and the filled orange stars. analyseImage() runs INSIDE a
// headless page (it needs a canvas), so it is self-contained.

/* eslint-disable no-var */
export async function analyseImage(dataUrl) {
  var GRID = 48;
  var img = new Image();
  img.src = dataUrl;
  await img.decode();
  var W = img.naturalWidth;
  var H = img.naturalHeight;

  var c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  var g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  var d = g.getImageData(0, 0, W, H).data;
  // ---- fingerprint: a difference hash of the grey picture, margins trimmed ----
  // A bit is set only where one cell is clearly darker than the next, so the
  // flat white of a page does not flip with the noise of saving it again.
  var bx0 = W;
  var by0 = H;
  var bx1 = -1;
  var by1 = -1;
  for (var py = 0; py < H; py++) {
    for (var px = 0; px < W; px++) {
      var k = (py * W + px) * 4;
      if (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2] < 235) {
        if (px < bx0) bx0 = px;
        if (px > bx1) bx1 = px;
        if (py < by0) by0 = py;
        if (py > by1) by1 = py;
      }
    }
  }
  if (bx1 < bx0 || by1 < by0) {
    bx0 = 0;
    by0 = 0;
    bx1 = W - 1;
    by1 = H - 1;
  }
  var N = GRID;
  var fc = document.createElement('canvas');
  fc.width = N + 1;
  fc.height = N;
  var fg = fc.getContext('2d', { willReadFrequently: true });
  fg.imageSmoothingEnabled = true;
  fg.imageSmoothingQuality = 'high';
  fg.drawImage(c, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, 0, 0, N + 1, N);
  var fd = fg.getImageData(0, 0, N + 1, N).data;
  var grey = new Float64Array((N + 1) * N);
  for (var i = 0; i < (N + 1) * N; i++) grey[i] = 0.299 * fd[i * 4] + 0.587 * fd[i * 4 + 1] + 0.114 * fd[i * 4 + 2];
  var hex = '';
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x += 4) {
      var nib = 0;
      for (var b = 0; b < 4; b++) nib = (nib << 1) | (grey[y * (N + 1) + x + b] > grey[y * (N + 1) + x + b + 1] + 8 ? 1 : 0);
      hex += nib.toString(16);
    }
  }

  // ---- stars: connected patches of Amazon's star orange ----
  var mask = new Uint8Array(W * H);
  for (var p = 0; p < W * H; p++) {
    var r = d[p * 4] / 255;
    var gg = d[p * 4 + 1] / 255;
    var bb = d[p * 4 + 2] / 255;
    var max = Math.max(r, gg, bb);
    var min = Math.min(r, gg, bb);
    if (max < 0.7 || max - min < 0.45 * max || max !== r) continue;
    var hue = 60 * ((gg - bb) / (max - min));
    // Star orange (#FFA41C is 36°). Not Amazon's darker "Verified Purchase" orange (about 26°), not the yellow buttons (51°).
    if (hue >= 30 && hue <= 46) mask[p] = 1;
  }
  var seen = new Uint8Array(W * H);
  var stack = new Int32Array(W * H);
  var parts = [];
  for (var s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    var top = 0;
    stack[top++] = s;
    seen[s] = 1;
    var n = 0;
    var x0 = W;
    var y0 = H;
    var x1 = 0;
    var y1 = 0;
    while (top) {
      var q = stack[--top];
      var qx = q % W;
      var qy = (q - qx) / W;
      n++;
      if (qx < x0) x0 = qx;
      if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy;
      if (qy > y1) y1 = qy;
      if (qx > 0 && mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[top++] = q - 1; }
      if (qx < W - 1 && mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[top++] = q + 1; }
      if (qy > 0 && mask[q - W] && !seen[q - W]) { seen[q - W] = 1; stack[top++] = q - W; }
      if (qy < H - 1 && mask[q + W] && !seen[q + W]) { seen[q + W] = 1; stack[top++] = q + W; }
    }
    var w = x1 - x0 + 1;
    var h = y1 - y0 + 1;
    var fill = n / (w * h);
    if (w >= 6 && h >= 6 && w <= 120 && h <= 120 && w / h >= 0.75 && w / h <= 1.35 && fill >= 0.25 && fill <= 0.8) {
      parts.push({ left: x0, top: y0, right: x1, bottom: y1, w: w, h: h });
    }
  }
  // Stars of one rating sit in a row: same height, same line, small gaps.
  parts.sort(function (a, z) { return a.left - z.left; });
  var groups = [];
  parts.forEach(function (pt) {
    var cy = (pt.top + pt.bottom) / 2;
    var gr = groups.find(function (G) {
      var last = G.stars[G.stars.length - 1];
      var lcy = (last.top + last.bottom) / 2;
      var gap = pt.left - last.right;
      return Math.abs(cy - lcy) < 0.35 * last.h && Math.abs(pt.h - last.h) <= 0.25 * last.h && gap >= -0.1 * last.w && gap <= 1.2 * last.w;
    });
    if (gr) gr.stars.push(pt);
    else groups.push({ stars: [pt] });
  });
  return {
    width: W,
    height: H,
    fingerprint: hex,
    starGroups: groups.map(function (G) {
      var f = G.stars[0];
      var l = G.stars[G.stars.length - 1];
      return {
        count: G.stars.length,
        left: f.left,
        top: Math.min.apply(null, G.stars.map(function (t) { return t.top; })),
        right: l.right,
        bottom: Math.max.apply(null, G.stars.map(function (t) { return t.bottom; })),
        size: f.h,
      };
    }),
  };
}

/** A small JPEG of a screenshot, at most `width` pixels wide, as base64. Runs INSIDE a headless page. */
export async function makeThumbnail(arg) {
  var dataUrl = arg.dataUrl;
  var width = arg.width;
  var img = new Image();
  img.src = dataUrl;
  await img.decode();
  var scale = Math.min(1, width / img.naturalWidth);
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  var g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}

/**
 * A copy of a screenshot made easier to read, as base64 PNG, or null when
 * there is nothing to change. Runs INSIDE a headless page.
 *   plain — a text selection made plain: its solid blue box becomes black
 *     words on white (an order number selected on a computer reads white on
 *     blue), a light blue selection tint becomes white, and the rest of the
 *     strong blue (a phone's selection handles, which sit on the words) is
 *     made white; null when the picture has no such blue.
 *   top — only the top strip of the picture, `scale` times as large: a
 *     computer's screenshot shows the page's address there, where Amazon
 *     writes the order ID ("orderId=403-…") in small letters.
 * See-through parts are made white first.
 */
export async function pictureForReading(arg) {
  var dataUrl = arg.dataUrl;
  var how = arg.how || {};
  var img = new Image();
  img.src = dataUrl;
  await img.decode();
  var W = img.naturalWidth;
  var H = img.naturalHeight;
  var c = document.createElement('canvas');
  var g;
  if (how.top) {
    var scale = how.scale || 3;
    var h = Math.min(H, Math.max(60, Math.min(Math.round(H * 0.12), 260)));
    c.width = W * scale;
    c.height = h * scale;
    g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }
  c.width = W;
  c.height = H;
  g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0);
  var im = g.getImageData(0, 0, W, H);
  var d = im.data;
  var strong = function (k) {
    return d[k + 2] >= 150 && d[k + 2] - d[k] >= 90 && d[k + 2] - d[k + 1] >= 20;
  };
  var tint = function (k) {
    return d[k + 2] >= 225 && d[k + 2] - d[k] >= 12 && d[k + 2] - d[k] <= 70 && d[k + 1] >= d[k] && 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2] >= 195;
  };
  // Each row's runs of strong blue, joined over the gaps the white letters leave: [start, end, share of blue].
  var runsOf = function (y) {
    var out = [];
    var x = 0;
    while (x < W) {
      if (!strong((y * W + x) * 4)) {
        x++;
        continue;
      }
      var x0 = x;
      var last = x;
      var count = 0;
      while (x < W && x - last <= 14) {
        if (strong((y * W + x) * 4)) {
          last = x;
          count++;
        }
        x++;
      }
      var len = last - x0 + 1;
      if (len >= 40) out.push([x0, last, count / len]);
      x = last + 1;
    }
    return out;
  };
  var rows = [];
  for (var y = 0; y < H; y++) rows.push(runsOf(y));
  // A selection box: a row of solid blue, rows with blue around the letters, and a last row of solid blue again.
  var boxes = [];
  var taken = new Array(H).fill(false);
  var shareAt = function (yy, a, b) {
    var n = 0;
    for (var xx = a; xx <= b; xx++) if (strong((yy * W + xx) * 4)) n++;
    return n / (b - a + 1);
  };
  for (var y0 = 0; y0 < H; y0++) {
    if (taken[y0]) continue;
    for (var r = 0; r < rows[y0].length; r++) {
      var run = rows[y0][r];
      if (run[2] < 0.85) continue;
      var y1 = y0;
      for (var yb = y0 + 1; yb < H && yb <= y0 + 140; yb++) {
        var sh = shareAt(yb, run[0], run[1]);
        if (sh < 0.15) break;
        if (sh >= 0.85) y1 = yb;
      }
      if (y1 - y0 + 1 >= 10) {
        boxes.push([run[0], y0, run[1], y1]);
        for (var yy = y0; yy <= y1; yy++) taken[yy] = true;
        break;
      }
    }
  }
  var inBox = function (x, y) {
    for (var i = 0; i < boxes.length; i++) if (x >= boxes[i][0] && x <= boxes[i][2] && y >= boxes[i][1] && y <= boxes[i][3]) return true;
    return false;
  };
  var changed = 0;
  for (var py = 0; py < H; py++) {
    for (var px = 0; px < W; px++) {
      var k = (py * W + px) * 4;
      var v = -1;
      // Inside a box the blue is the paper, and anything lighter is a letter.
      if (inBox(px, py)) v = strong(k) ? 255 : 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2] > 140 ? 0 : 255;
      else if (strong(k) || tint(k)) v = 255;
      if (v < 0) continue;
      d[k] = v;
      d[k + 1] = v;
      d[k + 2] = v;
      changed++;
    }
  }
  if (!changed) return null;
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}
/* eslint-enable no-var */

/** Bits that differ between two fingerprints, as a share from 0 to 1; null when either is missing. */
export function fingerprintDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff / (a.length * 4);
}

/**
 * Two screenshots this close are the same screenshot, resized or saved again.
 * Measured on the fixtures: the same review saved again as a smaller JPEG is
 * 3.5% apart; a different review in the same layout is 14% apart.
 */
export const SAME_SCREENSHOT = 0.08;
