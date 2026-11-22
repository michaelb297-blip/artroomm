/* ArtRooomM: erzeugt das Firmenbuch als .xlsx im Layout des Original-Firmenbuchs
   (OOXML + ZIP ohne Kompression, keine Bibliothek) und liest es wieder ein. */
(function (root) {
  "use strict";
  const enc = new TextEncoder();

  /* ---------- ZIP (STORE) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, DOS_TIME, true); h.setUint16(12, DOS_DATE, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, DOS_TIME, true); c.setUint16(14, DOS_DATE, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  /* ---------- Farben & Schriften wie im Original ---------- */
  const C = {
    band: "F6D6EB", head: "E694C2", sold: "EAAACF", open: "F8E5F1", colA: "EEBBDA", line: "DD9CC3",
    mintHead: "A0D7B8", mint: "E7F6EF", mintLine: "BFE0CF", right: "FCF1F7",
    inHead: "E491BE", inVal: "FAE4F0", outHead: "A0D6B8", outVal: "E7F6EF",
    gotHead: "BE9DE4", gotVal: "EEE6FC", holdHead: "E79EA9", holdVal: "F9E5E7",
    winHead: "F0CB60", winVal: "FDF6D4",
    title: "7B3D66", body: "5B1B40", tick: "9C2F64", mintTxt: "3E5A4C",
    inTxt: "8A2F62", outTxt: "2F5C47", gotTxt: "4A2E7A", holdTxt: "8E2F3A", winTxt: "6B5310", idTxt: "B58FA6"
  };
  const NARROW = "Aptos Narrow", DISPLAY = "Bernard MT Condensed";

  const fontList = [], fontKey = new Map();
  function font(o) {
    const k = JSON.stringify(o);
    if (!fontKey.has(k)) {
      fontKey.set(k, fontList.length);
      fontList.push(`<font>${o.b ? "<b/>" : ""}<sz val="${o.sz || 12}"/><color rgb="FF${o.c || C.body}"/><name val="${o.n || NARROW}"/><family val="${o.n === DISPLAY ? 1 : 2}"/></font>`);
    }
    return fontKey.get(k);
  }
  const fillList = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`], fillKey = new Map();
  function fill(hex) {
    if (!hex) return 0;
    if (!fillKey.has(hex)) { fillKey.set(hex, fillList.length); fillList.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${hex}"/><bgColor indexed="64"/></patternFill></fill>`); }
    return fillKey.get(hex);
  }
  const borderList = [`<border><left/><right/><top/><bottom/><diagonal/></border>`], borderKey = new Map();
  function border(hex) {
    if (!hex) return 0;
    if (!borderKey.has(hex)) {
      const s = d => `<${d} style="thin"><color rgb="FF${hex}"/></${d}>`;
      borderKey.set(hex, borderList.length); borderList.push(`<border>${s("left")}${s("right")}${s("top")}${s("bottom")}<diagonal/></border>`);
    }
    return borderKey.get(hex);
  }
  const NF_EUR = 164, NF_EUR2 = 165;
  const xfList = [], xfKey = new Map();
  // o: {f: fontObj, fill, border, nf, h, v, wrap, rot, cb}
  function st(o) {
    const k = JSON.stringify(o);
    if (xfKey.has(k)) return xfKey.get(k);
    const fi = font(o.f || {}), fl = fill(o.fill), bo = border(o.border), nf = o.nf || 0;
    const al = `<alignment${o.h ? ` horizontal="${o.h}"` : ""} vertical="${o.v || "center"}"${o.wrap ? ' wrapText="1"' : ""}${o.rot ? ` textRotation="${o.rot}"` : ""}/>`;
    const ext = o.cb ? `<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><xfpb:xfComplement i="0"/></ext></extLst>` : "";
    xfKey.set(k, xfList.length);
    xfList.push(`<xf numFmtId="${nf}" fontId="${fi}" fillId="${fl}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ""} applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}${ext}</xf>`);
    return xfKey.get(k);
  }
  st({}); // Standard (Index 0)

  /* ---------- Zellen ---------- */
  const xmlEsc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const flat = v => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
  const COLS = "ABCDEFGHIJKLMNOPQ";
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  // Zellinhalt: null | string | number | {b: bool} | {f: formel, v: wert, s: true wenn Text}
  function cellXml(ref, val, s) {
    const sa = s ? ` s="${s}"` : "";
    if (val === null || val === undefined || val === "") return `<c r="${ref}"${sa}/>`;
    if (typeof val === "number") return `<c r="${ref}"${sa}><v>${round2(val)}</v></c>`;
    if (typeof val === "string") return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
    if ("b" in val) return `<c r="${ref}"${sa} t="b"><v>${val.b ? 1 : 0}</v></c>`;
    if ("f" in val) return val.s ? `<c r="${ref}"${sa} t="str"><f>${xmlEsc(val.f)}</f><v>${xmlEsc(val.v)}</v></c>`
                                 : `<c r="${ref}"${sa}><f>${xmlEsc(val.f)}</f><v>${round2(val.v)}</v></c>`;
    return `<c r="${ref}"${sa}/>`;
  }

  const MONTHS_DE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const fixed2 = n => round2(n).toFixed(2).replace(".", ",");
  const PLATS = ["Vinted", "Privat", "Willhaben", "Etsy", "Sonstiges"];
  const PLAT_COL = { Vinted: "E", Privat: "F", Willhaben: "G", Etsy: "H", Sonstiges: "I" };

  /* ---------- Arbeitsmappe ---------- */
  function build(d) {
    const { orders, expenses, months } = d;
    const byM = (list, m) => list.filter(x => x.monat === m).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const usedMonths = months.filter(m => orders.some(o => o.monat === m) || expenses.some(e => e.monat === m));
    if (!usedMonths.length) usedMonths.push(months[months.length - 1]);

    // Stile
    const S = {
      band: st({ fill: C.band }),
      title: st({ f: { n: DISPLAY, sz: 26, c: C.title }, fill: C.band, h: "center" }),
      uebTitle: st({ f: { n: DISPLAY, sz: 22, c: C.title }, fill: C.band, h: "center" }),
      bow: st({ f: { sz: 13, b: true, c: "FFFFFF" }, fill: C.head, border: C.line, h: "center" }),
      head: st({ f: { sz: 13, b: true, c: "FFFFFF" }, fill: C.head, border: C.line, h: "center", wrap: true }),
      month: st({ f: { n: DISPLAY, sz: 16, c: C.title }, fill: C.colA, border: C.line, h: "center", rot: 90 }),
      txt: st({ f: {}, fill: C.open, border: C.line }),
      kunde: st({ f: {}, fill: C.open, border: C.line, h: "left" }),
      eur: st({ f: {}, fill: C.open, border: C.line, nf: NF_EUR }),
      tick: st({ f: { sz: 13, b: true, c: C.tick }, fill: C.open, border: C.line, h: "center" }),
      cb: st({ f: { sz: 12, c: C.body }, fill: C.open, border: C.line, h: "center", cb: true }),
      kHead: st({ f: { sz: 13, b: true, c: "FFFFFF" }, fill: C.mintHead, border: C.mintLine, h: "center" }),
      kTxt: st({ f: { c: C.mintTxt }, fill: C.mint, border: C.mintLine }),
      kEur: st({ f: { c: C.mintTxt }, fill: C.mint, border: C.mintLine, nf: NF_EUR }),
      right: st({ fill: C.right }),
      inHead: st({ f: { b: true, c: "FFFFFF" }, fill: C.inHead, border: C.inHead, h: "center" }),
      outHead: st({ f: { b: true, c: "FFFFFF" }, fill: C.outHead, border: C.outHead, h: "center" }),
      gotHead: st({ f: { b: true, c: "FFFFFF" }, fill: C.gotHead, border: C.gotHead, h: "center" }),
      holdHead: st({ f: { b: true, c: "FFFFFF" }, fill: C.holdHead, border: C.holdHead, h: "center" }),
      winHead: st({ f: { b: true, c: "FFFFFF" }, fill: C.winHead, border: C.winHead, h: "center" }),
      inVal: st({ f: { sz: 16, b: true, c: C.inTxt }, fill: C.inVal, border: C.inHead, h: "center", nf: NF_EUR2 }),
      outVal: st({ f: { sz: 16, b: true, c: C.outTxt }, fill: C.outVal, border: C.outHead, h: "center", nf: NF_EUR2 }),
      gotVal: st({ f: { sz: 16, b: true, c: C.gotTxt }, fill: C.gotVal, border: C.gotHead, h: "center", nf: NF_EUR2 }),
      holdVal: st({ f: { sz: 16, b: true, c: C.holdTxt }, fill: C.holdVal, border: C.holdHead, h: "center", nf: NF_EUR2 }),
      winVal: st({ f: { sz: 16, b: true, c: C.winTxt }, fill: C.winVal, border: C.winHead, h: "center", nf: NF_EUR2 }),
      id: st({ f: { sz: 9, c: C.idTxt } })
    };

    const rows = new Map(); // r -> {ht, cells: Map(col -> [val, s])}
    const put = (r, col, val, s) => { if (!rows.has(r)) rows.set(r, { cells: new Map() }); rows.get(r).cells.set(col, [val, s]); };
    const ht = (r, h) => { if (!rows.has(r)) rows.set(r, { cells: new Map() }); rows.get(r).ht = h; };
    const merges = [];

    // Zeile 1–2: Titelband
    for (const r of [1, 2]) { for (const c of "ABCDEFGHIJKL") put(r, c, null, S.band); put(r, "M", null, S.band); put(r, "N", null, S.band); ht(r, 24); }
    put(1, "A", "🧶 ArtRooomM · Firmenbuch 🎀", S.title); merges.push("A1:J2");
    put(1, "K", null, S.band); merges.push("K1:L2");
    put(1, "M", "✨ Übersicht ✨", S.uebTitle); merges.push("M1:N2");

    // Zeile 3: Kopfzeile
    ht(3, 34);
    put(3, "A", "🎀", S.bow);
    put(3, "B", "Aufträge", S.head);
    put(3, "C", "Name\nAuftraggeber", S.head);
    put(3, "D", "Preis", S.head);
    PLATS.forEach(p => {
      const col = PLAT_COL[p], n = orders.filter(o => (o.plattform || "Sonstiges") === p).length;
      put(3, col, { f: `"${p} ("&COUNTIF(${col}4:${col}1048576,"?*")&")"`, v: `${p} (${n})`, s: true }, S.head);
    });
    put(3, "J", "Verkauft/\nErledigt", S.head);
    put(3, "K", "Ausgaben", S.kHead); put(3, "L", null, S.kHead); merges.push("K3:L3");
    put(3, "O", "ID", S.id); put(3, "P", "ID Ausgabe", S.id); put(3, "Q", "Monat", S.id);

    // Monatsblöcke
    let r = 4;
    let totIn = 0, totOut = 0, totGot = 0;
    for (const m of usedMonths) {
      const os = byM(orders, m), es = byM(expenses, m);
      const size = Math.max(23, Math.max(os.length, es.length) + 8);
      const r0 = r, r1 = r + size - 1;
      const sumIn = os.reduce((a, o) => a + (+o.preis || 0), 0), sumOut = es.reduce((a, e) => a + (+e.betrag || 0), 0);
      totIn += sumIn; totOut += sumOut; totGot += os.filter(o => o.status === "verkauft").reduce((a, o) => a + (+o.preis || 0), 0);
      const name = MONTHS_DE[+m.slice(5) - 1];
      put(r0, "A", { f: `"${name} ("&FIXED(SUM(D${r0}:D${r1})-SUM(L${r0}:L${r1}),2)&" € Gewinn)"`, v: `${name} (${fixed2(sumIn - sumOut)} € Gewinn)`, s: true }, S.month);
      for (let i = r0 + 1; i <= r1; i++) put(i, "A", null, S.month);
      merges.push(`A${r0}:A${r1}`);
      for (let i = 0; i < size; i++) {
        const rr = r0 + i, o = os[i], e = es[i];
        ht(rr, 24);
        put(rr, "B", o ? flat(o.name) : null, S.txt);
        put(rr, "C", o ? (flat(o.kunde) || "-") : null, S.kunde);
        put(rr, "D", o ? (+o.preis || 0) : null, S.eur);
        PLATS.forEach(p => put(rr, PLAT_COL[p], o && (o.plattform || "Sonstiges") === p ? "✔" : null, S.tick));
        put(rr, "J", { b: !!(o && o.status === "verkauft") }, S.cb);
        put(rr, "K", e ? flat(e.name) : null, S.kTxt);
        put(rr, "L", e ? (+e.betrag || 0) : null, S.kEur);
        put(rr, "O", o ? o.id || "" : null, S.id);
        put(rr, "P", e ? e.id || "" : null, S.id);
        put(rr, "Q", m, S.id);
      }
      r = r1 + 1;
    }
    const lastRow = r - 1;

    // Übersicht (M3:N10) mit denselben Formeln wie im Original
    put(3, "M", "💖 Gesamt Einnahme", S.inHead); put(3, "N", "🧺 Gesamt Ausgaben", S.outHead);
    put(4, "M", { f: "SUM(D4:D1048576)", v: totIn }, S.inVal); put(4, "N", { f: "SUM(L4:L1048576)", v: totOut }, S.outVal);
    put(5, "M", null, S.right); put(5, "N", null, S.right);
    put(6, "M", "💜 Bereits erhalten", S.gotHead); put(6, "N", "⏳ On Hold", S.holdHead);
    put(7, "M", { f: "SUMIF(J4:J1048576,TRUE,D4:D1048576)", v: totGot }, S.gotVal); put(7, "N", { f: "M4-M7", v: totIn - totGot }, S.holdVal);
    put(8, "M", null, S.right); put(8, "N", null, S.right);
    put(9, "M", "⭐ Gesamt Gewinn ⭐", S.winHead); put(9, "N", null, S.winHead); merges.push("M9:N9");
    put(10, "M", { f: "M4-N4", v: totIn - totOut }, S.winVal); put(10, "N", null, S.winVal); merges.push("M10:N10");
    for (let i = 11; i <= lastRow; i++) { put(i, "M", null, S.right); put(i, "N", null, S.right); }

    // Blatt-XML
    const widths = { A: 7.5, B: 25, C: 17, D: 11.5, E: 11, F: 10, G: 14, H: 8, I: 14, J: 12, K: 18, L: 13, M: 23, N: 23, O: 12, P: 12, Q: 9 };
    const hidden = { O: 1, P: 1, Q: 1 };
    const cols = `<cols>${[...COLS].map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[c]}" customWidth="1"${hidden[c] ? ' hidden="1"' : ""}/>`).join("")}</cols>`;
    const body = [...rows.keys()].sort((a, b) => a - b).map(rr => {
      const row = rows.get(rr);
      const cells = [...row.cells.entries()].sort((a, b) => COLS.indexOf(a[0]) - COLS.indexOf(b[0])).map(([c, [v, s]]) => cellXml(c + rr, v, s)).join("");
      return `<row r="${rr}"${row.ht ? ` ht="${row.ht}" customHeight="1"` : ""}>${cells}</row>`;
    }).join("");
    const cf = `<conditionalFormatting sqref="B4:J${lastRow}"><cfRule type="expression" dxfId="0" priority="1"><formula>$J4=TRUE</formula></cfRule></conditionalFormatting>`;
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:Q${lastRow}"/><sheetViews><sheetView workbookViewId="0" zoomScale="100"/></sheetViews><sheetFormatPr defaultRowHeight="16"/>${cols}<sheetData>${body}</sheetData><mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>${cf}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="${NF_EUR}" formatCode="_-&quot;€&quot;\\ * #,##0.00_-;\\-&quot;€&quot;\\ * #,##0.00_-;_-&quot;€&quot;\\ * &quot;-&quot;??_-;_-@_-"/><numFmt numFmtId="${NF_EUR2}" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="${fontList.length}">${fontList.join("")}</fonts>
<fills count="${fillList.length}">${fillList.join("")}</fills>
<borders count="${borderList.length}">${borderList.join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfList.length}">${xfList.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="1"><dxf><fill><patternFill patternType="solid"><fgColor rgb="FF${C.sold}"/><bgColor rgb="FF${C.sold}"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;

    const fpb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FeaturePropertyBags xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><bag type="Checkbox"/><bag type="XFControls"><bagId k="CellControl">0</bagId></bag><bag type="XFComplement"><bagId k="XFControls">1</bagId></bag><bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag></FeaturePropertyBags>`;

    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Firmenbuch" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="featurePropertyBag/featurePropertyBag.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: styles },
      { name: "xl/featurePropertyBag/featurePropertyBag.xml", data: fpb },
      { name: "xl/worksheets/sheet1.xml", data: sheet }
    ];
    return zip(files);
  }

  function toBase64(bytes) {
    let s = ""; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  }

  /* ---------- Excel lesen & abgleichen ---------- */
  const MONTHS = { "jänner": 1, "jaenner": 1, "januar": 1, "jan": 1, "februar": 2, "feber": 2, "feb": 2, "märz": 3, "maerz": 3, "mär": 3, "mrz": 3, "april": 4, "apr": 4, "mai": 5,
    "juni": 6, "jun": 6, "juli": 7, "jul": 7, "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9, "oktober": 10, "okt": 10, "november": 11, "nov": 11, "dezember": 12, "dez": 12 };
  function parseNum(v) {
    let t = String(v || "").replace(/[€\s ]|EUR/gi, "");
    if (!t || t === "-") return NaN;
    const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
    if (lc > -1 && ld > -1) { t = lc > ld ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""); }
    else if (lc > -1) t = t.replace(",", ".");
    const n = Number(t); return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  const isSold = v => /^(✓|✔|☑|x|ja|j|1|verkauft|yes|y|true|wahr)$/i.test(String(v || "").trim());
  const VALID_ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

  function readSheets(text) {
    const out = {};
    let cur = null;
    String(text || "").split(/\r?\n/).forEach(line => {
      const h = line.match(/^## Sheet: (.+?) —/);
      if (h) { cur = h[1].trim(); out[cur] = []; return; }
      if (cur && line.length && !/^(Formulas|Formeln)\b/.test(line)) out[cur].push(line.split("\t"));
    });
    return out;
  }
  // Liest die Zeilen des Firmenbuchs (Layout wie das Original). rows: Array von Zeilen, jede Zeile Array von Strings ab Spalte A.
  function parseRows(rows, fallbackMonth) {
    const hi = rows.findIndex(r => String(r[1] || "").trim() === "Aufträge");
    if (hi < 0) return { orders: null, expenses: null };
    const g = (r, i) => String(r[i] ?? "").trim();
    const orders = [], expenses = [];
    let month = fallbackMonth, labelYear = fallbackMonth.slice(0, 4);
    rows.slice(hi + 1).forEach((r, k) => {
      const rowNo = hi + 2 + k;
      const q = g(r, 16);
      if (VALID_MONTH.test(q)) { month = q; labelYear = q.slice(0, 4); }
      else {
        const lab = g(r, 0).toLowerCase().match(/^([a-zäö]+)\.?\s*(\d{4})?/);
        if (lab && MONTHS[lab[1]]) { month = (lab[2] || labelYear) + "-" + String(MONTHS[lab[1]]).padStart(2, "0"); }
      }
      const oName = g(r, 1), preis = parseNum(g(r, 3));
      if (oName || !isNaN(preis)) {
        const plats = ["Vinted", "Privat", "Willhaben", "Etsy", "Sonstiges"];
        let plattform = "Sonstiges";
        for (let i = 0; i < 5; i++) if (g(r, 4 + i)) { plattform = plats[i]; break; }
        const kunde = g(r, 2), id = g(r, 14);
        orders.push({ id: VALID_ID.test(id) ? id : "", name: oName || "Ohne Namen", kunde: kunde === "-" ? "" : kunde, preis: isNaN(preis) ? 0 : preis,
          plattform, monat: month, status: isSold(g(r, 9)) ? "verkauft" : "offen", row: rowNo });
      }
      const eName = g(r, 10), betrag = parseNum(g(r, 11));
      if (eName || !isNaN(betrag)) {
        const id = g(r, 15);
        expenses.push({ id: VALID_ID.test(id) ? id : "", name: eName || "Ausgabe", betrag: isNaN(betrag) ? 0 : betrag, monat: month, row: rowNo });
      }
    });
    return { orders, expenses };
  }
  function parseRead(text, fallbackMonth) {
    const sh = readSheets(text);
    const name = Object.keys(sh).find(n => sh[n].some(r => (r[1] || "").trim() === "Aufträge"));
    return name ? parseRows(sh[name], fallbackMonth) : { orders: null, expenses: null };
  }
  // Zellwerte (z. B. aus der Excel-Schnittstelle) in Text-Zeilen ab A1 umwandeln
  function cellStr(v) { return v === true ? "TRUE" : v === false ? "FALSE" : v == null ? "" : String(v); }
  function gridToRows(values, startRow, startCol) {
    const rows = [];
    for (let i = 1; i < startRow; i++) rows.push([]);
    values.forEach(r => rows.push([...Array(startCol).fill(""), ...r.map(cellStr)]));
    return rows;
  }
  function parseGrid(values, startRow, startCol, fallbackMonth) { return parseRows(gridToRows(values, startRow, startCol), fallbackMonth); }

  /* Monatsblöcke einer bestehenden Excel (Spalte Q) */
  function fileBlocks(rows) {
    const hi = rows.findIndex(r => String(r[1] || "").trim() === "Aufträge");
    const blocks = [];
    if (hi < 0) return blocks;
    rows.forEach((r, i) => {
      if (i <= hi) return;
      const q = String(r[16] ?? "").trim(), rowNo = i + 1;
      if (!VALID_MONTH.test(q)) return;
      const last = blocks[blocks.length - 1];
      if (last && last.m === q && last.r1 === rowNo - 1) last.r1 = rowNo; else blocks.push({ m: q, r0: rowNo, r1: rowNo });
    });
    return blocks;
  }
  /* Werte für die Spalten B–L und O–P eines bestehenden Layouts. Gibt null zurück, wenn das Layout nicht passt (neuer Monat / zu wenig Zeilen). */
  function valuesForLayout(blocks, orders, expenses) {
    if (!blocks.length) return null;
    const PL = ["Vinted", "Privat", "Willhaben", "Etsy", "Sonstiges"];
    const byM = (list, m) => list.filter(x => x.monat === m).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const months = new Set([...orders.map(o => o.monat), ...expenses.map(e => e.monat)]);
    for (const m of months) { const b = blocks.find(x => x.m === m); if (!b) return null; if (Math.max(byM(orders, m).length, byM(expenses, m).length) > b.r1 - b.r0 + 1) return null; }
    const r0 = blocks[0].r0, r1 = blocks[blocks.length - 1].r1;
    // Lücken zwischen Blöcken würden überschrieben – nur zusammenhängende Layouts
    for (let i = 1; i < blocks.length; i++) if (blocks[i].r0 !== blocks[i - 1].r1 + 1) return null;
    const BL = [], OP = [];
    for (const b of blocks) {
      const os = byM(orders, b.m), es = byM(expenses, b.m);
      for (let i = 0; i <= b.r1 - b.r0; i++) {
        const o = os[i], e = es[i];
        BL.push([o ? flat(o.name) : "", o ? (flat(o.kunde) || "-") : "", o ? (+o.preis || 0) : "",
          ...PL.map(p => o && (o.plattform || "Sonstiges") === p ? "✔" : ""), !!(o && o.status === "verkauft"),
          e ? flat(e.name) : "", e ? (+e.betrag || 0) : ""]);
        OP.push([o ? o.id || "" : "", e ? e.id || "" : ""]);
      }
    }
    return { r0, r1, BL, OP };
  }
  const sameCell = (a, b) => {
    if (typeof b === "number" || typeof a === "number") { const x = parseNum(cellStr(a)), y = typeof b === "number" ? b : parseNum(cellStr(b)); return (isNaN(x) && isNaN(y) && cellStr(a).trim() === cellStr(b).trim()) || Math.abs(x - y) < 0.005; }
    if (typeof b === "boolean") return isSold(cellStr(a)) === b;
    return cellStr(a).trim() === cellStr(b).trim();
  };
  function gridDiffers(rows, want) {
    for (let i = 0; i < want.BL.length; i++) {
      const r = rows[want.r0 - 1 + i] || [];
      for (let c = 0; c < 11; c++) if (!sameCell(r[1 + c] ?? "", want.BL[i][c])) return true;
      for (let c = 0; c < 2; c++) if (!sameCell(r[14 + c] ?? "", want.OP[i][c])) return true;
    }
    return false;
  }

  /* ---------- .xlsx lesen (Ersatzweg, falls die Excel-Schnittstelle nicht verfügbar ist) ---------- */
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function unzip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("zip");
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const out = {}, dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), start = off + 30 + lnl + lxl;
      const data = u8.subarray(start, start + csize);
      out[name] = { method, data };
      p += 46 + nlen + xlen + clen;
    }
    const get = async name => { const f = out[name]; if (!f) return null; return dec.decode(f.method === 8 ? await inflateRaw(f.data) : f.data); };
    return { names: Object.keys(out), get };
  }
  async function readXlsxRows(u8) {
    const z = await unzip(u8);
    const sheetName = z.names.find(n => /^xl\/worksheets\/sheet1\.xml$/.test(n)) || z.names.find(n => /^xl\/worksheets\/.*\.xml$/.test(n));
    const sx = await z.get(sheetName), ssx = await z.get("xl/sharedStrings.xml");
    const dom = s => new DOMParser().parseFromString(s, "application/xml");
    const shared = ssx ? [...dom(ssx).getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join("")) : [];
    const rows = [];
    for (const c of dom(sx).getElementsByTagName("c")) {
      const ref = c.getAttribute("r"), m = ref.match(/^([A-Z]+)(\d+)$/); if (!m) continue;
      let col = 0; for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0], is = c.getElementsByTagName("is")[0];
      let val = "";
      if (t === "s" && v) val = shared[+v.textContent] ?? "";
      else if (t === "inlineStr" && is) val = [...is.getElementsByTagName("t")].map(x => x.textContent).join("");
      else if (t === "b" && v) val = v.textContent === "1" ? "TRUE" : "FALSE";
      else if (v) val = v.textContent;
      const r = +m[2]; while (rows.length < r) rows.push([]);
      rows[r - 1][col - 1] = val;
    }
    return rows;
  }
  function hashStr(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  // Nur Felder, die auch in der Excel stehen (Notizen und Fotos bleiben in der App)
  const rowHashO = o => hashStr([flat(o.name), flat(o.kunde) === "-" ? "" : flat(o.kunde), (+o.preis || 0).toFixed(2), o.plattform || "Sonstiges", o.monat, o.status === "verkauft" ? 1 : 0].join("|"));
  const rowHashE = e => hashStr([flat(e.name), (+e.betrag || 0).toFixed(2), e.monat].join("|"));
  function lastMap(docs, fn) { const m = {}; docs.forEach(d => { if (d.id) m[d.id] = fn(d); }); return m; }

  /* Plant, was aus der Excel in die App übernommen wird.
     docs: aktuelle App-Einträge; rows: aus Excel gelesen; last: {id: hash} vom letzten Hochladen. */
  function planOne(docs, rows, last, fn, matchKey) {
    const plan = { creates: [], updates: [], deletes: [] };
    if (!rows || !last) return plan;
    const byId = new Map(docs.map(d => [d.id, d]));
    const seen = new Set();
    rows.forEach(r => {
      if (r.id && byId.has(r.id) && !seen.has(r.id)) seen.add(r.id);
      else if (r.id && !byId.has(r.id) && last[r.id] !== undefined) r.skip = true; // in der App gelöscht
      else r.id = "";
    });
    const unmatched = docs.filter(d => !seen.has(d.id));
    rows.forEach(r => {
      if (r.skip) return;
      if (r.id) {
        const d = byId.get(r.id), h = fn(r);
        if (h !== last[r.id] && h !== fn(d)) plan.updates.push({ id: r.id, row: r });
        return;
      }
      // Zeile ohne ID: gehört sie zu einem Eintrag, dessen ID in der Excel fehlt?
      const i = unmatched.findIndex(d => matchKey(d) === matchKey(r));
      if (i > -1) { const d = unmatched.splice(i, 1)[0]; seen.add(d.id); if (fn(r) !== fn(d) && fn(r) !== last[d.id]) plan.updates.push({ id: d.id, row: r }); return; }
      plan.creates.push({ row: r });
    });
    // In der Excel gelöschte Zeilen: nur Einträge, die beim letzten Mal hochgeladen und seither in der App nicht geändert wurden
    if (rows.length > 0 || docs.length === 0) {
      docs.forEach(d => { if (!seen.has(d.id) && last[d.id] !== undefined && last[d.id] === fn(d)) plan.deletes.push({ id: d.id }); });
    }
    return plan;
  }
  function planMerge(a) {
    return {
      orders: planOne(a.orders, a.excel.orders, a.lastO, rowHashO, o => [flat(o.name).toLowerCase(), (+o.preis || 0).toFixed(2), o.monat].join("|")),
      expenses: planOne(a.expenses, a.excel.expenses, a.lastE, rowHashE, e => [flat(e.name).toLowerCase(), (+e.betrag || 0).toFixed(2), e.monat].join("|"))
    };
  }

  const LAYOUT_VERSION = 3;
  const api = { build, toBase64, parseRead, parseRows, parseGrid, gridToRows, fileBlocks, valuesForLayout, gridDiffers, readXlsxRows, planMerge, rowHashO, rowHashE, lastMap, LAYOUT_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ArtXlsx = api;
})(typeof window !== "undefined" ? window : globalThis);
