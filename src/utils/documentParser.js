// Lazy-loaded heavy binary parsers to keep initial bundle ultra-fast
const loadJSZip = async () => (await import('jszip')).default;
const loadPdfLib = async () => await import('pdf-lib');

/**
 * Determine document family from filename and mime type
 */
export function getDocumentKind(file) {
  if (!file) return 'unknown';
  const ext = (file.name?.split('.').pop() || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (['doc', 'rtf', 'odt'].includes(ext)) return 'legacy-word';
  if (['xlsx', 'xls'].includes(ext) || mime.includes('spreadsheetml')) return 'xlsx';
  if (['csv', 'tsv'].includes(ext) || mime === 'text/csv') return 'csv';
  if (['pptx', 'ppt'].includes(ext) || mime.includes('presentationml')) return 'pptx';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (ext === 'json') return 'json';
  if (
    file.category === 'code' ||
    ['js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rs', 'php', 'sql', 'sh', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env'].includes(ext)
  ) {
    return 'code';
  }
  if (['txt', 'log'].includes(ext) || mime.startsWith('text/')) return 'text';
  if (file.category === 'document') return 'text';
  return 'other';
}

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * 1. Parse real OpenXML .docx Blob into structured HTML + Editable Text/Markdown
 */
export async function parseDocxBlob(blob) {
  try {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(blob);
    const docFile = zip.file('word/document.xml');
    if (!docFile) {
      throw new Error('Missing word/document.xml');
    }

    const xmlText = await docFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.documentElement;
    const htmlParts = [];
    const textLines = [];

    const extractParagraph = (pNode) => {
      let pStyleVal = '';
      const pStyle = pNode.getElementsByTagName('w:pStyle')[0];
      if (pStyle) {
        pStyleVal = pStyle.getAttribute('w:val') || '';
      }
      const numPr = pNode.getElementsByTagName('w:numPr')[0];
      const isList = Boolean(numPr);

      let maxFontSize = 0;
      const runs = pNode.getElementsByTagName('w:r');
      let runHtml = '';
      let runText = '';

      if (runs.length > 0) {
        for (let i = 0; i < runs.length; i++) {
          const r = runs[i];
          const rPr = r.getElementsByTagName('w:rPr')[0];
          const isBold = Boolean(rPr && rPr.getElementsByTagName('w:b').length > 0);
          const isItalic = Boolean(rPr && rPr.getElementsByTagName('w:i').length > 0);
          const isUnderline = Boolean(rPr && rPr.getElementsByTagName('w:u').length > 0);
          const szNode = rPr ? rPr.getElementsByTagName('w:sz')[0] : null;
          if (szNode) {
            const val = parseInt(szNode.getAttribute('w:val') || '0', 10);
            if (val > maxFontSize) maxFontSize = val;
          }

          let tCombined = '';
          const tNodes = r.getElementsByTagName('w:t');
          for (let j = 0; j < tNodes.length; j++) {
            tCombined += tNodes[j].textContent || '';
          }
          const brNodes = r.getElementsByTagName('w:br');
          if (brNodes.length > 0) {
            tCombined += '\n';
          }
          const tabNodes = r.getElementsByTagName('w:tab');
          if (tabNodes.length > 0) {
            tCombined += '\t';
          }

          if (!tCombined) continue;
          runText += tCombined;

          let chunk = escapeHtml(tCombined);
          if (isBold) chunk = `<strong>${chunk}</strong>`;
          if (isItalic) chunk = `<em>${chunk}</em>`;
          if (isUnderline) chunk = `<u>${chunk}</u>`;
          runHtml += chunk;
        }
      } else {
        // Fallback if text nodes exist directly under p
        const tNodes = pNode.getElementsByTagName('w:t');
        for (let j = 0; j < tNodes.length; j++) {
          const val = tNodes[j].textContent || '';
          runText += val;
          runHtml += escapeHtml(val);
        }
      }

      const trimmed = runText.trim();
      if (!trimmed) {
        return { html: '', text: '' };
      }

      const isH1 = /heading\s*1|^title$/i.test(pStyleVal) || maxFontSize >= 32;
      const isH2 = /heading\s*2|^subtitle$/i.test(pStyleVal) || (maxFontSize >= 26 && maxFontSize < 32);
      const isH3 = /heading\s*3/i.test(pStyleVal) || (maxFontSize >= 24 && maxFontSize < 26);

      if (isH1) {
        return {
          html: `<h1 style="font-size:1.45rem;font-weight:700;margin:16px 0 8px 0;color:inherit;">${runHtml}</h1>`,
          text: `# ${trimmed}`
        };
      }
      if (isH2) {
        return {
          html: `<h2 style="font-size:1.2rem;font-weight:600;margin:14px 0 6px 0;color:inherit;">${runHtml}</h2>`,
          text: `## ${trimmed}`
        };
      }
      if (isH3) {
        return {
          html: `<h3 style="font-size:1.05rem;font-weight:600;margin:12px 0 4px 0;color:inherit;">${runHtml}</h3>`,
          text: `### ${trimmed}`
        };
      }
      if (isList) {
        return {
          html: `<div style="display:flex;gap:8px;margin:4px 0 4px 12px;"><span>&bull;</span><span>${runHtml}</span></div>`,
          text: `- ${trimmed}`
        };
      }

      return {
        html: `<p style="margin:0 0 10px 0;line-height:1.65;">${runHtml}</p>`,
        text: runText
      };
    };

    const children = body ? body.childNodes : [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeName === 'w:p') {
        const { html, text } = extractParagraph(node);
        if (html) htmlParts.push(html);
        if (text !== '') textLines.push(text);
      } else if (node.nodeName === 'w:tbl') {
        const rows = node.getElementsByTagName('w:tr');
        let tableHtml = `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:0.86rem;"><tbody>`;
        const tableTextRows = [];
        for (let r = 0; r < rows.length; r++) {
          const cells = rows[r].getElementsByTagName('w:tc');
          tableHtml += '<tr>';
          const rowVals = [];
          for (let c = 0; c < cells.length; c++) {
            const cellText = (cells[c].textContent || '').trim();
            rowVals.push(cellText);
            tableHtml += `<td style="border:1px solid rgba(128,128,128,0.3);padding:6px 10px;">${escapeHtml(cellText)}</td>`;
          }
          tableHtml += '</tr>';
          tableTextRows.push(rowVals.join(' | '));
        }
        tableHtml += '</tbody></table>';
        htmlParts.push(tableHtml);
        textLines.push(tableTextRows.join('\n'));
      }
    }

    // If body traversal found nothing, fallback to all w:p elements
    if (textLines.length === 0) {
      const allP = xmlDoc.getElementsByTagName('w:p');
      for (let i = 0; i < allP.length; i++) {
        const { html, text } = extractParagraph(allP[i]);
        if (html) htmlParts.push(html);
        if (text) textLines.push(text);
      }
    }

    const finalText = textLines.join('\n\n') || '';
    const finalHtml = htmlParts.join('\n') || `<p>${escapeHtml(finalText)}</p>`;

    return {
      text: finalText,
      html: finalHtml
    };
  } catch {
    // Fallback if file is actually a plain text / HTML saved with .docx extension
    try {
      const raw = await blob.text();
      if (!raw.startsWith('PK')) {
        return {
          text: raw,
          html: raw.split('\n').map(l => `<p style="margin:0 0 8px 0;">${escapeHtml(l)}</p>`).join('')
        };
      }
    } catch {}
    return {
      text: '',
      html: '<p>Unable to extract Word document text.</p>'
    };
  }
}

/**
 * 2. Build a real valid OpenXML .docx Blob from edited text/markdown
 */
export async function buildDocxBlob(title, text) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const lines = (text || '').split('\n');
  const paragraphs = lines
    .map((line) => {
      const isH1 = line.startsWith('# ');
      const isH2 = line.startsWith('## ');
      const isH3 = line.startsWith('### ');
      const isBullet = line.startsWith('- ') || line.startsWith('* ');

      let rawContent = line;
      if (isH1) rawContent = line.slice(2);
      else if (isH2) rawContent = line.slice(3);
      else if (isH3) rawContent = line.slice(4);
      else if (isBullet) rawContent = '• ' + line.slice(2);

      const clean = escapeHtml(rawContent || ' ');
      const sz = isH1 ? '32' : isH2 ? '26' : isH3 ? '24' : '22';
      const boldTag = isH1 || isH2 || isH3 ? '<w:b/>' : '';

      return `<w:p>
      <w:pPr><w:rPr>${boldTag}<w:sz w:val="${sz}"/></w:rPr></w:pPr>
      <w:r><w:rPr>${boldTag}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${clean}</w:t></w:r>
    </w:p>`;
    })
    .join('\n');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

/**
 * 3. Parse legacy .rtf / .doc / .odt files cleanly without binary garbage
 */
export async function parseLegacyWordBlob(blob, ext) {
  if (ext === 'odt') {
    try {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(blob);
      const contentXml = zip.file('content.xml');
      if (contentXml) {
        const xmlStr = await contentXml.async('string');
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'application/xml');
        const pNodes = doc.getElementsByTagName('text:p');
        const lines = [];
        for (let i = 0; i < pNodes.length; i++) {
          const t = (pNodes[i].textContent || '').trim();
          if (t) lines.push(t);
        }
        const text = lines.join('\n\n');
        return {
          text,
          html: lines.map(l => `<p style="margin:0 0 10px 0;">${escapeHtml(l)}</p>`).join('')
        };
      }
    } catch {}
  }

  const rawText = await blob.text();

  // Check if RTF
  if (ext === 'rtf' || rawText.trim().startsWith('{\\rtf')) {
    const cleaned = rawText
      .replace(/\\par\b/g, '\n')
      .replace(/\\line\b/g, '\n')
      .replace(/\\tab\b/g, '\t')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|[a-z]+)[^{}]*\}/g, '')
      .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, '')
      .trim();
    return {
      text: cleaned,
      html: cleaned
        .split('\n')
        .filter(Boolean)
        .map(l => `<p style="margin:0 0 10px 0;">${escapeHtml(l)}</p>`)
        .join('')
    };
  }

  // Check if binary OLE2 (.doc) — extract printable ASCII/UTF-8 runs
  if (rawText.charCodeAt(0) === 0xd0 || rawText.includes('\x00\x00\x00')) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    let current = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
        current += String.fromCharCode(b);
      } else if (b !== 0) {
        if (current.trim().length >= 5) {
          chunks.push(current.trim());
        }
        current = '';
      }
    }
    if (current.trim().length >= 5) chunks.push(current.trim());
    const filtered = chunks.filter(
      c =>
        !/^(Root Entry|WordDocument|SummaryInformation|DocumentSummaryInformation|Normal\.dotm|Microsoft Word|Times New Roman|Calibri)/i.test(
          c
        )
    );
    const extracted = filtered.join('\n\n') || 'Legacy Word Document';
    return {
      text: extracted,
      html: filtered.map(l => `<p style="margin:0 0 10px 0;">${escapeHtml(l)}</p>`).join('')
    };
  }

  return {
    text: rawText,
    html: rawText
      .split('\n')
      .map(l => `<p style="margin:0 0 10px 0;">${escapeHtml(l)}</p>`)
      .join('')
  };
}

/**
 * 4. Parse Spreadsheet (.xlsx / .csv / .tsv) into 2D rows + CSV string
 */
export async function parseSpreadsheetBlob(blob, ext) {
  if (ext === 'xlsx') {
    try {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(blob);
      const sharedStrings = [];
      const ssFile = zip.file('xl/sharedStrings.xml');
      if (ssFile) {
        const ssXml = await ssFile.async('string');
        const doc = new DOMParser().parseFromString(ssXml, 'application/xml');
        const siNodes = doc.getElementsByTagName('si');
        for (let i = 0; i < siNodes.length; i++) {
          sharedStrings.push(siNodes[i].textContent || '');
        }
      }

      // Find first worksheet
      const sheetFile =
        zip.file('xl/worksheets/sheet1.xml') ||
        Object.values(zip.files).find(f => f.name.startsWith('xl/worksheets/sheet') && f.name.endsWith('.xml'));

      if (sheetFile) {
        const sheetXml = await sheetFile.async('string');
        const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
        const rowNodes = doc.getElementsByTagName('row');
        const rows = [];
        for (let r = 0; r < rowNodes.length; r++) {
          const cNodes = rowNodes[r].getElementsByTagName('c');
          const rowVals = [];
          for (let c = 0; c < cNodes.length; c++) {
            const cell = cNodes[c];
            const type = cell.getAttribute('t');
            const vNode = cell.getElementsByTagName('v')[0];
            const isNode = cell.getElementsByTagName('is')[0];
            let val = vNode ? vNode.textContent || '' : isNode ? isNode.textContent || '' : '';
            if (type === 's') {
              const idx = parseInt(val, 10);
              val = sharedStrings[idx] !== undefined ? sharedStrings[idx] : val;
            }
            rowVals.push(val);
          }
          if (rowVals.some(v => v !== '')) rows.push(rowVals);
        }
        return {
          rows,
          csvText: rowsToCsv(rows)
        };
      }
    } catch {}
  }

  // Parse CSV / TSV text
  const text = await blob.text();
  const delimiter = ext === 'tsv' ? '\t' : ',';
  const rows = parseCsvToRows(text, delimiter);
  return {
    rows,
    csvText: text
  };
}

export function parseCsvToRows(csvText, delimiter = ',') {
  const lines = (csvText || '').split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map(line => {
    const values = [];
    let insideQuotes = false;
    let curr = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          curr += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        values.push(curr);
        curr = '';
      } else {
        curr += char;
      }
    }
    values.push(curr);
    return values;
  });
}

export function rowsToCsv(rows, delimiter = ',') {
  return (rows || [])
    .map(row =>
      row
        .map(cell => {
          const str = cell === null || cell === undefined ? '' : String(cell);
          if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(delimiter)
    )
    .join('\n');
}

/**
 * 5. Extract PDF metadata, page count, and readable text streams
 */
export async function extractPdfDetails(blob) {
  let pageCount = 1;
  let title = '';
  let extractedText = '';

  try {
    const { PDFDocument } = await loadPdfLib();
    const arrayBuffer = await blob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
    title = pdfDoc.getTitle() || '';

    // Extract text literals from PDF stream operators (...) Tj and [...] TJ
    const rawLatin = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer));
    const textMatches = [];

    // Extract parenthesized strings near Tj / TJ blocks
    const btBlocks = rawLatin.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btBlocks) {
      const strLiterals = block.match(/\((?:\\.|[^\\()])*\)/g) || [];
      const lineParts = [];
      for (const lit of strLiterals) {
        const inner = lit
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (/^[\x20-\x7E\s]+$/.test(inner) && inner.trim().length > 0) {
          lineParts.push(inner);
        }
      }
      if (lineParts.length > 0) {
        textMatches.push(lineParts.join(''));
      }
    }

    if (textMatches.length > 0) {
      extractedText = textMatches.join('\n');
    }
  } catch {}

  return {
    pageCount,
    title,
    extractedText
  };
}

/**
 * 6. Compile a real multi-page PDF from text/markdown content using pdf-lib
 */
export async function compileTextToPdfBlob(docTitle, textContent, options = {}) {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(docTitle || 'StorageBank Document');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const isLandscape = options.orientation === 'landscape';
  const pageWidth = isLandscape ? 841.89 : 595.28;
  const pageHeight = isLandscape ? 595.28 : 841.89;
  const margin = 48;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNum = 1;

  const drawFooter = (p, num) => {
    p.drawText(`Page ${num}`, {
      x: pageWidth / 2 - 18,
      y: 24,
      size: 8.5,
      font,
      color: rgb(0.45, 0.45, 0.5)
    });
  };

  // Sanitize characters outside WinAnsi range for StandardFonts
  const sanitizeWinAnsi = (str) =>
    String(str || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

  const rawLines = (textContent || '').split('\n');

  for (const rawLine of rawLines) {
    const isH1 = rawLine.startsWith('# ');
    const isH2 = rawLine.startsWith('## ');
    const isH3 = rawLine.startsWith('### ');
    const isBullet = rawLine.startsWith('- ') || rawLine.startsWith('* ');

    let cleanLine = rawLine;
    if (isH1) cleanLine = rawLine.slice(2);
    else if (isH2) cleanLine = rawLine.slice(3);
    else if (isH3) cleanLine = rawLine.slice(4);
    else if (isBullet) cleanLine = '  •  ' + rawLine.slice(2);

    cleanLine = sanitizeWinAnsi(cleanLine);

    const fontSize = isH1 ? 17 : isH2 ? 13.5 : isH3 ? 11.5 : 10.5;
    const activeFont = isH1 || isH2 || isH3 ? boldFont : font;
    const lineHeight = Math.round(fontSize * 1.45);
    const maxChars = Math.floor((pageWidth - margin * 2) / (fontSize * 0.52));

    if (isH1 || isH2) y -= 4;

    const words = cleanLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
      } else {
        if (y < margin + 28) {
          drawFooter(page, pageNum);
          pageNum++;
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(currentLine || ' ', {
          x: margin,
          y,
          size: fontSize,
          font: activeFont,
          color: rgb(0.12, 0.12, 0.16)
        });
        y -= lineHeight;
        currentLine = word;
      }
    }

    if (currentLine.length > 0 || rawLine === '') {
      if (y < margin + 28) {
        drawFooter(page, pageNum);
        pageNum++;
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(currentLine || ' ', {
        x: margin,
        y,
        size: fontSize,
        font: activeFont,
        color: rgb(0.12, 0.12, 0.16)
      });
      y -= lineHeight;
    }
  }

  drawFooter(page, pageNum);
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * 7. Perform direct PDF page operations on an existing PDF Blob (Rotate, Watermark, Append Page)
 */
export async function applyPdfOperations(blob, { rotateDeg = 0, watermarkText = '', appendPageText = '' }) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await loadPdfLib();
  const arrayBuffer = await blob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const sanitizeWinAnsi = (str) =>
    String(str || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

  const pages = pdfDoc.getPages();
  pages.forEach((p) => {
    if (rotateDeg) {
      const curr = p.getRotation().angle || 0;
      p.setRotation(degrees((curr + rotateDeg) % 360));
    }
    if (watermarkText.trim()) {
      const { width, height } = p.getSize();
      p.drawText(sanitizeWinAnsi(watermarkText.trim()), {
        x: width * 0.18,
        y: height * 0.5,
        size: 28,
        font: boldFont,
        color: rgb(0.75, 0.75, 0.8),
        rotate: degrees(30),
        opacity: 0.35
      });
    }
  });

  if (appendPageText.trim()) {
    const lastSize = pages.length > 0 ? pages[pages.length - 1].getSize() : { width: 595.28, height: 841.89 };
    const newPage = pdfDoc.addPage([lastSize.width, lastSize.height]);
    const margin = 48;
    let y = lastSize.height - margin;

    const lines = sanitizeWinAnsi(appendPageText).split('\n');
    for (const line of lines) {
      if (y < margin) break;
      newPage.drawText(line.slice(0, 90) || ' ', {
        x: margin,
        y,
        size: 11,
        font,
        color: rgb(0.12, 0.12, 0.16)
      });
      y -= 16;
    }
  }

  const savedBytes = await pdfDoc.save();
  return new Blob([savedBytes], { type: 'application/pdf' });
}
