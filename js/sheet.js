// The count sheet: one page, laid out once and then drawn either into a PDF
// (what gets sent) or onto a canvas (the preview he sees), so the preview is
// exactly the PDF.

import {
  drywallTotals, totalSheets, totalBoxes, screwRows, siteRows, sectionTotal, ceilingFor,
  mapUrl, fmtDate, num, plural,
} from './model.js';

const PAGE_W = 612; // US Letter, in points
const PAGE_H = 792;
const M = 30;
const FOOTER_H = 18;
const INK = '#111111';
const MUTED = '#5c6470';
const RULE = '#c9ced6';
const ACCENT = '#0b4fa8';
const RED = '#b3261e';
const SHADE = '#eef2f7';
const ROW_SHADE = '#f6f8fb';
const FONT = 'helvetica';

// The built-in PDF fonts only know basic Latin characters. iPhones type
// curly quotes and dashes, so swap those for plain ones and drop emoji.
export function pdfSafe(str) {
  return String(str ?? '')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[×✕✖]/g, 'x')
    .replace(/•/g, '-')
    .replace(/[  -​ ]/g, ' ')
    .replace(/[\r\t]/g, ' ')
    .normalize('NFC')
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, '');
}

let measureDoc = null;
const jsPDF = () => window.jspdf.jsPDF;

class Painter {
  constructor(doc) {
    this.doc = doc;
    this.ops = [];
  }
  font(size, style = 'normal') {
    this.doc.setFont(FONT, style);
    this.doc.setFontSize(size);
  }
  width(str, size, style) {
    this.font(size, style);
    return this.doc.getTextWidth(pdfSafe(str));
  }
  wrap(str, size, style, maxW) {
    this.font(size, style);
    return pdfSafe(str)
      .split('\n')
      .flatMap((p) => (p.trim() ? this.doc.splitTextToSize(p, Math.max(maxW, 10)) : []));
  }
  // y is the TOP of the line; returns the line height used.
  text(str, x, y, { size = 10, style = 'normal', color = INK, align = 'left', url = null } = {}) {
    const s = pdfSafe(str);
    if (s) this.ops.push({ t: 'text', s, x, y: y + size * 0.8, size, style, color, align, url });
    return size * 1.25;
  }
  line(x1, y1, x2, y2, { w = 0.5, color = RULE } = {}) {
    this.ops.push({ t: 'line', x1, y1, x2, y2, w, color });
  }
  rect(x, y, w, h, { fill = null, stroke = null, r = 0, lw = 0.6 } = {}) {
    this.ops.push({ t: 'rect', x, y, w, h, fill, stroke, r, lw });
  }
}

/* ---------- data for the sheet ---------- */

function prepare(c, settings) {
  const pin = c.job.pin;
  const sc = screwRows(c);
  const notes = [];
  if (c.drywallNote.trim()) notes.push({ label: 'Drywall', text: c.drywallNote.trim() });
  if (c.screws.note.trim()) notes.push({ label: 'Screws', text: c.screws.note.trim() });
  if (c.site.note.trim()) notes.push({ label: 'Job site', text: c.site.note.trim() });
  return {
    builder: c.job.builder.trim(),
    address: c.job.address.trim(),
    company: (settings.company || '').trim(),
    counter: (settings.counter || '').trim(),
    date: fmtDate(c.completedAt || c.updatedAt),
    draft: c.status !== 'complete',
    mapUrl: mapUrl(c),
    gps: pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : '',
    totals: drywallTotals(c),
    totalSheets: totalSheets(c),
    areas: c.sections.length,
    screws: sc,
    boxes: totalBoxes(c),
    scaffold: c.site.scaffold.needed,
    site: siteRows(c),
    rooms: c.sections.map((s) => ({
      name: s.name.trim() || '(unnamed area)',
      ceiling: ceilingFor(c, s.id),
      lines: s.lines.filter((l) => l.type.trim() || l.size.trim() || num(l.qty)),
      note: s.note.trim(),
      total: sectionTotal(s),
      unfinished: !s.done,
    })),
    notes,
  };
}

/* ---------- layout ---------- */

// Fit items (with known heights) into `cols` columns, in order, as evenly as possible.
function packColumns(heights, cols) {
  if (!heights.length) return { assign: [], height: 0 };
  let lo = Math.max(...heights);
  let hi = heights.reduce((a, b) => a + b, 0);
  const fits = (H) => {
    let col = 1;
    let acc = 0;
    for (const h of heights) {
      if (acc + h > H + 0.01) {
        col++;
        acc = h;
      } else acc += h;
    }
    return col <= cols;
  };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const assign = [];
  let col = 0;
  let acc = 0;
  for (const h of heights) {
    if (acc > 0 && acc + h > hi + 0.01) {
      col++;
      acc = 0;
    }
    assign.push(col);
    acc += h;
  }
  return { assign, height: hi };
}

function layout(doc, d, s, cols) {
  const p = new Painter(doc);
  const L = M;
  const R = PAGE_W - M;
  const W = R - L;
  const hs = Math.max(s, 0.75); // the header shrinks less than the body
  let y = M;

  /* header */
  const rightW = 165;
  let ry = y;
  ry += p.text('DRYWALL COUNT', R, ry, { size: 12 * hs, style: 'bold', color: ACCENT, align: 'right' });
  ry += p.text(d.date, R, ry, { size: 9 * hs, color: MUTED, align: 'right' });
  if (d.counter) ry += p.text(`Counted by: ${d.counter}`, R, ry, { size: 9 * hs, color: MUTED, align: 'right' });
  if (d.draft) ry += p.text('DRAFT - NOT FINISHED', R, ry, { size: 9 * hs, style: 'bold', color: RED, align: 'right' });

  let ly = y;
  if (d.company) ly += p.text(d.company.toUpperCase(), L, ly, { size: 8.5 * hs, style: 'bold', color: MUTED });
  for (const line of p.wrap(d.builder || '(builder not entered yet)', 20 * hs, 'bold', W - rightW)) {
    ly += p.text(line, L, ly, { size: 20 * hs, style: 'bold' });
  }
  for (const line of p.wrap(d.address || '(address not entered yet)', 12 * hs, 'normal', W - rightW)) {
    ly += p.text(line, L, ly, { size: 12 * hs });
  }
  if (d.mapUrl) {
    ly += 2;
    const label = d.gps ? `Map pin: ${d.gps}  (tap to open in Google Maps)` : 'Map: tap to open in Google Maps';
    const h = p.text(label, L, ly, { size: 8.5 * hs, color: ACCENT, url: d.mapUrl });
    p.line(L, ly + 8.5 * hs * 0.95, L + p.width(label, 8.5 * hs), ly + 8.5 * hs * 0.95, { w: 0.4, color: ACCENT });
    ly += h;
  }
  y = Math.max(ly, ry) + 6 * hs;
  p.line(L, y, R, y, { w: 1.4, color: INK });
  y += 8 * hs;

  /* at-a-glance strip */
  const stats = [
    ['TOTAL SHEETS', String(d.totalSheets), false],
    ['AREAS', String(d.areas), false],
    ['SCREWS', d.screws.builder ? 'BUILDER SUPPLIES' : d.screws.missing ? '-' : plural(d.boxes, 'box', 'boxes'), !!d.screws.builder],
    ['SCAFFOLDING', d.scaffold === true ? 'YES' : d.scaffold === false ? 'NO' : '-', d.scaffold === true],
  ];
  const stripH = 34 * hs;
  p.rect(L, y, W, stripH, { fill: SHADE, r: 4 });
  const cw = W / stats.length;
  stats.forEach(([label, value, warn], i) => {
    const cx = L + cw * i + cw / 2;
    p.text(label, cx, y + 5 * hs, { size: 7 * hs, style: 'bold', color: MUTED, align: 'center' });
    p.text(value, cx, y + 15 * hs, { size: (value.length > 10 ? 11 : 15) * hs, style: 'bold', color: warn ? RED : INK, align: 'center' });
    if (i) p.line(L + cw * i, y + 5, L + cw * i, y + stripH - 5, { color: RULE });
  });
  y += stripH + 10 * s;

  const heading = (title) => {
    y += p.text(title, L, y, { size: 9.5 * s, style: 'bold', color: ACCENT });
    p.line(L, y, R, y, { w: 0.8, color: ACCENT });
    y += 4 * s;
  };

  /* materials */
  heading('MATERIALS TO ORDER');
  const gap = 16;
  const leftW = W * 0.58;
  const rightX = L + leftW + gap;
  const rightColW = W - leftW - gap;
  const fs = 9.5 * s;
  const rowH = fs * 1.45;
  const qtyW = 34 * s;

  let my = y;
  p.text('QTY', L + qtyW - 4, my, { size: 7 * s, style: 'bold', color: MUTED, align: 'right' });
  p.text('DRYWALL', L + qtyW + 4, my, { size: 7 * s, style: 'bold', color: MUTED });
  p.text('SIZE', L + leftW, my, { size: 7 * s, style: 'bold', color: MUTED, align: 'right' });
  my += 7 * s * 1.4;
  if (!d.totals.length) {
    my += p.text('(nothing counted yet)', L + qtyW + 4, my, { size: fs, style: 'italic', color: MUTED });
  }
  d.totals.forEach((t, i) => {
    const sizeW = p.width(t.size, fs, 'normal') + 10;
    const lines = p.wrap(t.type, fs, 'normal', leftW - qtyW - 4 - sizeW);
    const h = Math.max(1, lines.length) * fs * 1.2 + (rowH - fs * 1.2);
    if (i % 2 === 0) p.rect(L, my, leftW, h, { fill: ROW_SHADE });
    const ty = my + (rowH - fs * 1.2) / 2;
    p.text(String(t.qty), L + qtyW - 4, ty, { size: fs, style: 'bold', align: 'right' });
    lines.forEach((ln, j) => p.text(ln, L + qtyW + 4, ty + j * fs * 1.2, { size: fs }));
    p.text(t.size, L + leftW - 3, ty, { size: fs, align: 'right' });
    my += h;
  });
  p.line(L, my + 1, L + leftW, my + 1, { w: 0.8, color: INK });
  my += 3;
  p.text(String(d.totalSheets), L + qtyW - 4, my, { size: fs, style: 'bold', align: 'right' });
  my += p.text('TOTAL SHEETS', L + qtyW + 4, my, { size: fs, style: 'bold' });

  let sy = y;
  sy += p.text('SCREWS', rightX, sy, { size: 7 * s, style: 'bold', color: MUTED }) * 0.9;
  if (d.screws.builder) {
    const bh = 30 * s;
    p.rect(rightX, sy, rightColW, bh, { stroke: RED, lw: 1.2, r: 3 });
    p.text('SUPPLIED BY BUILDER', rightX + rightColW / 2, sy + 5 * s, { size: 10.5 * s, style: 'bold', color: RED, align: 'center' });
    p.text('No screws on this order', rightX + rightColW / 2, sy + 17 * s, { size: 8 * s, color: RED, align: 'center' });
    sy += bh;
  } else if (d.screws.missing) {
    sy += p.text('(not filled in yet)', rightX, sy, { size: fs, style: 'italic', color: MUTED });
  } else {
    for (const r of d.screws.rows) {
      const qty = plural(r.boxes, 'box', 'boxes');
      const qw = p.width(qty, fs, 'bold') + 6;
      const lines = p.wrap(r.type || '(type not picked)', fs, 'normal', rightColW - qw);
      p.text(qty, rightX, sy, { size: fs, style: 'bold' });
      lines.forEach((ln) => (sy += p.text(ln, rightX + qw, sy, { size: fs })));
      const why = [r.reason, r.areas.length ? `For: ${r.areas.join(', ')}` : ''].filter(Boolean).join(' - ');
      if (why) for (const ln of p.wrap(`Why: ${why}`, 8 * s, 'italic', rightColW - qw)) sy += p.text(ln, rightX + qw, sy, { size: 8 * s, style: 'italic', color: MUTED });
      sy += 2 * s;
    }
  }
  y = Math.max(my, sy) + 10 * s;

  /* job site */
  heading('JOB SITE CHECK');
  const siteGap = 18;
  const siteColW = (W - siteGap) / 2;
  const labelW = Math.max(...d.site.map((r) => p.width(r.label.toUpperCase(), 7.5 * s, 'bold'))) + 8 * s;
  const vs = 8.8 * s;
  const siteBlock = (painter, row, x, top) => {
    let yy = top;
    painter.text(row.label.toUpperCase(), x, yy + 0.6 * s, { size: 7.5 * s, style: 'bold', color: MUTED });
    const lines = row.missing ? ['(not answered yet)'] : row.lines;
    const style = row.missing ? 'italic' : row.attention ? 'bold' : 'normal';
    const color = row.missing ? MUTED : row.attention ? RED : INK;
    for (const v of lines) for (const ln of painter.wrap(v, vs, style, siteColW - labelW)) yy += painter.text(ln, x + labelW, yy, { size: vs, style, color });
    return yy - top + 4 * s;
  };
  const scratch = new Painter(doc);
  const siteH = d.site.map((r) => siteBlock(scratch, r, 0, 0));
  const sitePack = packColumns(siteH, 2);
  const siteY = [y, y];
  d.site.forEach((r, i) => {
    const col = sitePack.assign[i];
    siteY[col] += siteBlock(p, r, L + col * (siteColW + siteGap), siteY[col]);
  });
  y = Math.max(...siteY) + 6 * s;

  /* by area */
  heading('COUNT BY AREA');
  const roomGap = 14;
  const roomW = (W - roomGap * (cols - 1)) / cols;
  const rs = 9 * s;
  const roomBlock = (painter, room, x, top) => {
    let yy = top + 2 * s;
    const right = room.unfinished ? 'NOT FINISHED' : plural(room.total, 'sheet');
    const rw = painter.width(right, 7.5 * s, 'bold') + 6;
    painter.text(right, x + roomW, yy + 1.5 * s, { size: 7.5 * s, style: 'bold', color: room.unfinished ? RED : MUTED, align: 'right' });
    const title = room.ceiling ? `${room.name}  (${room.ceiling} ceiling)` : room.name;
    for (const ln of painter.wrap(title, 10 * s, 'bold', roomW - rw)) yy += painter.text(ln, x, yy, { size: 10 * s, style: 'bold' });
    const qx = 24 * s;
    for (const l of room.lines) {
      painter.text(num(l.qty) ? String(num(l.qty)) : '?', x + qx - 5, yy, { size: rs, style: 'bold', align: 'right' });
      const t = `${l.type.trim() || '?'}  ${l.size.trim()}`;
      for (const ln of painter.wrap(t, rs, 'normal', roomW - qx)) yy += painter.text(ln, x + qx, yy, { size: rs });
    }
    if (room.note) for (const ln of painter.wrap(`Note: ${room.note}`, 8.3 * s, 'italic', roomW - qx)) yy += painter.text(ln, x + qx, yy, { size: 8.3 * s, style: 'italic', color: MUTED });
    yy += 3 * s;
    painter.line(x, yy, x + roomW, yy, { w: 0.4 });
    return yy - top + 1;
  };
  if (!d.rooms.length) y += p.text('(no areas counted yet)', L, y, { size: rs, style: 'italic', color: MUTED });
  const roomH = d.rooms.map((r) => roomBlock(scratch, r, 0, 0));
  const roomPack = packColumns(roomH, cols);
  const colY = Array(cols).fill(y);
  d.rooms.forEach((r, i) => {
    const col = roomPack.assign[i];
    colY[col] += roomBlock(p, r, L + col * (roomW + roomGap), colY[col]);
  });
  y = Math.max(...colY) + 8 * s;

  /* notes */
  if (d.notes.length) {
    heading('NOTES');
    for (const n of d.notes) {
      const lw = p.width(`${n.label}:`, 9 * s, 'bold') + 5;
      p.text(`${n.label}:`, L, y, { size: 9 * s, style: 'bold' });
      for (const ln of p.wrap(n.text, 9 * s, 'normal', W - lw)) y += p.text(ln, L + lw, y, { size: 9 * s });
      y += 2 * s;
    }
  }

  /* footer (always at the bottom of the page) */
  const fy = PAGE_H - M - FOOTER_H + 6;
  p.line(L, fy, R, fy, { w: 0.5 });
  const foot = [d.builder, d.address].filter(Boolean).join(' - ');
  p.text(foot.length > 90 ? foot.slice(0, 88) + '...' : foot, L, fy + 4, { size: 7, color: MUTED });
  p.text(d.draft ? 'Draft' : `Completed ${d.date}`, R, fy + 4, { size: 7, color: MUTED, align: 'right' });

  return { ops: p.ops, bottom: y, scale: s, cols };
}

// Lay out at the biggest text size that still fits on ONE page.
export function buildSheet(c, settings) {
  if (!measureDoc) measureDoc = new (jsPDF())({ unit: 'pt', format: 'letter' });
  const d = prepare(c, settings);
  const limit = PAGE_H - M - FOOTER_H;
  const tries = [];
  for (let s = 1; s >= 0.6; s -= 0.04) tries.push([2, s]);
  for (let s = 0.8; s >= 0.3; s -= 0.04) tries.push([3, s]);
  let result = null;
  for (const [cols, s] of tries) {
    result = layout(measureDoc, d, +s.toFixed(2), cols);
    if (result.bottom <= limit) break;
  }
  result.meta = d;
  return result;
}

/* ---------- output: PDF ---------- */

export function sheetToPdf(sheet) {
  const doc = new (jsPDF())({ unit: 'pt', format: 'letter', compress: true });
  const d = sheet.meta;
  doc.setProperties({
    title: pdfSafe(`Drywall Count - ${d.builder} - ${d.address}`),
    subject: 'Drywall count',
    creator: 'Drywall Count app',
  });
  for (const op of sheet.ops) {
    if (op.t === 'rect') {
      const style = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
      if (op.fill) doc.setFillColor(op.fill);
      if (op.stroke) {
        doc.setDrawColor(op.stroke);
        doc.setLineWidth(op.lw);
      }
      if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, style);
      else doc.rect(op.x, op.y, op.w, op.h, style);
    } else if (op.t === 'line') {
      doc.setDrawColor(op.color);
      doc.setLineWidth(op.w);
      doc.line(op.x1, op.y1, op.x2, op.y2);
    } else if (op.t === 'text') {
      doc.setFont(FONT, op.style);
      doc.setFontSize(op.size);
      doc.setTextColor(op.color);
      doc.text(op.s, op.x, op.y, { align: op.align });
      if (op.url) {
        const w = doc.getTextWidth(op.s);
        const x = op.align === 'right' ? op.x - w : op.align === 'center' ? op.x - w / 2 : op.x;
        doc.link(x, op.y - op.size, w, op.size * 1.3, { url: op.url });
      }
    }
  }
  return doc;
}

export function pdfFileName(c) {
  const clean = (s) => pdfSafe(s).replace(/[\\/:*?"<>|#%&{}$!@+`=]/g, '').replace(/\s+/g, ' ').trim();
  const name = ['Drywall Count', clean(c.job.builder), clean(c.job.address).split(',')[0]].filter(Boolean).join(' - ');
  return `${name.slice(0, 90)}.pdf`;
}

export function makePdfFile(c, settings) {
  const blob = sheetToPdf(buildSheet(c, settings)).output('blob');
  return new File([blob], pdfFileName(c), { type: 'application/pdf' });
}

export function shareText(c) {
  const lines = [`This is the drywall count for ${c.job.builder.trim()} at ${c.job.address.trim()}.`];
  const url = mapUrl(c);
  if (url) lines.push('', `📍 Map pin: ${url}`);
  return lines.join('\n');
}

/* ---------- output: canvas preview ---------- */

export function drawSheet(canvas, sheet, pxPerPt) {
  const k = pxPerPt;
  canvas.width = Math.round(PAGE_W * k);
  canvas.height = Math.round(PAGE_H * k);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = 'alphabetic';
  for (const op of sheet.ops) {
    if (op.t === 'rect') {
      ctx.beginPath();
      if (op.r && ctx.roundRect) ctx.roundRect(op.x, op.y, op.w, op.h, op.r);
      else ctx.rect(op.x, op.y, op.w, op.h);
      if (op.fill) {
        ctx.fillStyle = op.fill;
        ctx.fill();
      }
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.lw;
        ctx.stroke();
      }
    } else if (op.t === 'line') {
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.w;
      ctx.stroke();
    } else if (op.t === 'text') {
      const st = op.style === 'bolditalic' ? 'italic bold ' : op.style === 'normal' ? '' : op.style + ' ';
      ctx.font = `${st}${op.size}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.fillText(op.s, op.x, op.y);
    }
  }
}

export const PAGE = { W: PAGE_W, H: PAGE_H };
