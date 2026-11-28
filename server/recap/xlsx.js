// A small, dependency-free .xlsx writer that supports what the monthly recap
// needs and ExcelJS does not: real, editable Excel charts.
//
// Workbook shape:
//   buildXlsx({ sheets: [{ name, cols, rows, merges, charts }] }) -> Buffer
//   rows:   array of rows; each row is an array of cells. A cell is
//           null | number | string | { v, s, f } where s is a style name below
//           and f an optional formula (v is then its cached result).
//   charts: [{ type: 'bar' | 'col' | 'doughnut', title, from: [col,row], to: [col,row],
//              categories: { sheet, col, from, to },          // 0-based col, 1-based rows
//              series: [{ name, sheet, col, from, to, color }] }]

const zlib = require('zlib');

// ---------- zip ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---------- helpers ----------
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function colName(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function quoteSheet(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function ref(sheet, col, from, to) {
  const c = colName(col);
  return `${quoteSheet(sheet)}!$${c}$${from}:$${c}$${to}`;
}

// ---------- styles ----------
// Order matters: the index of each name is its cellXfs index.
const STYLE_NAMES = [
  'default',
  'header',
  'money',
  'percent',
  'title',
  'bold',
  'date',
  'muted',
  'moneyBold',
  'wrap',
  'kpiLabel',
  'kpiMoney',
  'kpiPercent',
  'moneyRed',
  'subtitle'
];
const STYLE = Object.fromEntries(STYLE_NAMES.map((n, i) => [n, i]));

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]\\-&quot;$&quot;#,##0.00"/>
<numFmt numFmtId="165" formatCode="0%"/>
<numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd"/>
</numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="FF1C1B19"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B6760"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF1C1B19"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="9"/><color rgb="FF6B6760"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1EFEB"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${STYLE_NAMES.length}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="6" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="5" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="5" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ---------- sheets ----------
function cellXml(cell, r, c) {
  if (cell === null || cell === undefined || cell === '') return '';
  const obj = typeof cell === 'object' && !(cell instanceof Date) ? cell : { v: cell };
  const addr = `${colName(c)}${r}`;
  const s = obj.s ? ` s="${STYLE[obj.s] ?? 0}"` : '';
  const v = obj.v;
  if (obj.f) {
    // Formula with a cached result so viewers that don't recalculate still show it.
    const cached = typeof v === 'number' && Number.isFinite(v) ? `<v>${v}</v>` : '';
    return `<c r="${addr}"${s}><f>${esc(obj.f)}</f>${cached}</c>`;
  }
  if (v === null || v === undefined || v === '') return obj.s ? `<c r="${addr}"${s}/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${addr}"${s}><v>${v}</v></c>`;
  return `<c r="${addr}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet, hasDrawing) {
  const cols = (sheet.cols || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const rows = sheet.rows
    .map((row, ri) => {
      const r = ri + 1;
      const height = sheet.rowHeights && sheet.rowHeights[r] ? ` ht="${sheet.rowHeights[r]}" customHeight="1"` : '';
      const cells = (row || []).map((cell, ci) => cellXml(cell, r, ci)).join('');
      return `<row r="${r}"${height}>${cells}</row>`;
    })
    .join('');
  const merges =
    sheet.merges && sheet.merges.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
  const freeze = sheet.freezeRow
    ? `<pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${sheet.fitWidth ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : ''}
<sheetViews><sheetView workbookViewId="0"${sheet.hideGrid ? ' showGridLines="0"' : ''}>${freeze}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${rows}</sheetData>
${merges}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
${sheet.fitWidth ? '<pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/>' : ''}
${hasDrawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

// ---------- charts ----------
function cellValue(sheets, sheetName, col, row) {
  const sh = sheets.find((s) => s.name === sheetName);
  const cell = sh && sh.rows[row - 1] && sh.rows[row - 1][col];
  if (cell === null || cell === undefined) return null;
  return typeof cell === 'object' ? cell.v : cell;
}

function strCache(sheets, { sheet, col, from, to }) {
  const pts = [];
  for (let r = from; r <= to; r++) {
    const v = cellValue(sheets, sheet, col, r);
    pts.push(`<c:pt idx="${r - from}"><c:v>${esc(v ?? '')}</c:v></c:pt>`);
  }
  return `<c:strCache><c:ptCount val="${to - from + 1}"/>${pts.join('')}</c:strCache>`;
}

function numCache(sheets, { sheet, col, from, to }) {
  const pts = [];
  for (let r = from; r <= to; r++) {
    const v = cellValue(sheets, sheet, col, r);
    if (typeof v === 'number') pts.push(`<c:pt idx="${r - from}"><c:v>${v}</c:v></c:pt>`);
  }
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${to - from + 1}"/>${pts.join('')}</c:numCache>`;
}

function solid(hex) {
  return `<a:solidFill><a:srgbClr val="${hex.replace('#', '').toUpperCase()}"/></a:solidFill>`;
}

const AXIS_TEXT = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">${solid('#57534D')}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

function titleXml(text) {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1">${solid('#1C1B19')}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

function seriesXml(sheets, chart, s, i) {
  const catRef = ref(chart.categories.sheet, chart.categories.col, chart.categories.from, chart.categories.to);
  const valRef = ref(s.sheet, s.col, s.from, s.to);
  const dPts =
    chart.type === 'doughnut' && chart.pointColors
      ? chart.pointColors
          .map(
            (c, idx) =>
              `<c:dPt><c:idx val="${idx}"/><c:bubble3D val="0"/><c:spPr>${solid(c)}<a:ln w="12700">${solid('#FFFFFF')}</a:ln></c:spPr></c:dPt>`
          )
          .join('')
      : '';
  const spPr = chart.type === 'doughnut' ? '' : `<c:spPr>${solid(s.color || '#4F46E5')}</c:spPr>`;
  const inverted = chart.type === 'doughnut' ? '' : '<c:invertIfNegative val="0"/>';
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>
<c:tx><c:v>${esc(s.name)}</c:v></c:tx>
${spPr}${inverted}${dPts}
<c:cat><c:strRef><c:f>${esc(catRef)}</c:f>${strCache(sheets, chart.categories)}</c:strRef></c:cat>
<c:val><c:numRef><c:f>${esc(valRef)}</c:f>${numCache(sheets, s)}</c:numRef></c:val>
</c:ser>`;
}

function chartXml(sheets, chart) {
  const series = chart.series.map((s, i) => seriesXml(sheets, chart, s, i)).join('');
  let plot;
  if (chart.type === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${series}
<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>
<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  } else {
    const dir = chart.type === 'bar' ? 'bar' : 'col';
    plot = `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}
<c:gapWidth val="60"/><c:overlap val="-10"/><c:axId val="1001"/><c:axId val="1002"/></c:barChart>
<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="${dir === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${dir === 'bar' ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525">${solid('#D6D3CD')}</a:ln></c:spPr>${AXIS_TEXT}<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${dir === 'bar' ? 't' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350">${solid('#ECEAE5')}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="&quot;$&quot;#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${AXIS_TEXT}<c:crossAx val="1001"/><c:crosses val="${dir === 'bar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
${titleXml(chart.title)}
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>${plot}</c:plotArea>
<c:legend><c:legendPos val="${chart.type === 'doughnut' ? 'r' : 'b'}"/><c:overlay val="0"/>${AXIS_TEXT}</c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr>${solid('#FFFFFF')}<a:ln w="9525">${solid('#E4E1DB')}</a:ln></c:spPr>
</c:chartSpace>`;
}

function drawingXml(charts, firstChartRid) {
  const anchors = charts
    .map(
      (ch, i) => `<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${ch.from[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.from[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${ch.to[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.to[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(ch.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${firstChartRid + i}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

// ---------- workbook ----------
function buildXlsx({ sheets, title = 'Wealthline' }) {
  const files = [];
  const overrides = [];
  let chartNo = 0;
  let drawingNo = 0;

  sheets.forEach((sheet, si) => {
    const n = si + 1;
    const charts = sheet.charts || [];
    files.push({ name: `xl/worksheets/sheet${n}.xml`, data: sheetXml(sheet, charts.length > 0) });
    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    );
    if (charts.length) {
      drawingNo++;
      files.push({
        name: `xl/worksheets/_rels/sheet${n}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`
      });
      files.push({ name: `xl/drawings/drawing${drawingNo}.xml`, data: drawingXml(charts, 1) });
      overrides.push(
        `<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
      );
      const rels = charts.map((ch, i) => {
        chartNo++;
        files.push({ name: `xl/charts/chart${chartNo}.xml`, data: chartXml(sheets, ch) });
        overrides.push(
          `<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
        );
        return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`;
      });
      files.push({
        name: `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`
      });
    }
  });

  files.unshift(
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${overrides.join('\n')}
</Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`
    },
    {
      name: 'docProps/core.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Wealthline</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets
  .map(
    (s, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  )
  .join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    { name: 'xl/styles.xml', data: STYLES_XML }
  );

  return zip(files);
}

module.exports = { buildXlsx, colName };
