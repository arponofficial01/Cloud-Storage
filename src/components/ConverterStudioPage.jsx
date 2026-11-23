import React, { useState, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useStorage } from '../context/StorageContext';
import { saveConvertedBlob, getConvertedBlob, getAllConvertedBlobs, deleteConvertedBlob } from '../services/dbService';
import { getFileColorStyle } from '../utils/fileTypeStyles';
import {
  RefreshCw,
  Upload,
  HardDrive,
  Download,
  Trash2,
  Search,
  FileText,
  Check,
  X,
  Eye,
  SlidersHorizontal,
  CheckCircle2,
  FileType
} from 'lucide-react';

// ── Persist converted session history across refreshes ────────────────────────
const LS_KEY = 'converter_session_history';
function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map(i => ({ ...i, fileObj: null }));
  } catch {
    return [];
  }
}

function saveSession(items) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.map(i => ({ ...i, fileObj: null }))));
  } catch {
    // quota exceeded — ignore
  }
}

// ── Target Formats Definition ──────────────────────────────────────────────────
const FORMATS = [
  { key: 'pdf',  label: 'PDF Document',       ext: '.pdf',  category: 'document', desc: 'Standard Portable Document with real pagination' },
  { key: 'docx', label: 'Word Document',      ext: '.docx', category: 'document', desc: 'Valid Microsoft Word OpenXML (.docx) package' },
  { key: 'html', label: 'HTML Web Page',      ext: '.html', category: 'document', desc: 'Clean semantic web page with styling' },
  { key: 'md',   label: 'Markdown',           ext: '.md',   category: 'document', desc: 'Lightweight formatted markdown file' },
  { key: 'txt',  label: 'Plain Text',         ext: '.txt',  category: 'document', desc: 'Unformatted UTF-8 raw text' },
  { key: 'png',  label: 'PNG Image',          ext: '.png',  category: 'image',    desc: 'Lossless transparent raster image' },
  { key: 'jpeg', label: 'JPEG Image',         ext: '.jpg',  category: 'image',    desc: 'Compressed photo format with custom quality' },
  { key: 'webp', label: 'WebP Image',         ext: '.webp', category: 'image',    desc: 'Modern web image with optimal compression' },
  { key: 'json', label: 'JSON Data',          ext: '.json', category: 'data',     desc: 'Structured JSON array with indentation' },
  { key: 'csv',  label: 'CSV Spreadsheet',    ext: '.csv',  category: 'data',     desc: 'Comma-separated spreadsheet table' }
];

const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
  txt:  'text/plain',
  md:   'text/markdown',
  json: 'application/json',
  csv:  'text/csv',
  png:  'image/png',
  jpeg: 'image/jpeg',
  jpg:  'image/jpeg',
  webp: 'image/webp'
};

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── REAL CONVERSION FUNCTIONS ──────────────────────────────────────────────────

// 1. Image → PDF via PDFDocument (Embeds real PNG/JPEG into real PDF page)
async function convertImageToPdf(blob, baseName, options = {}) {
  const pdfDoc = await PDFDocument.create();
  let img;

  if (blob.type === 'image/png') {
    const pngBytes = await blob.arrayBuffer();
    img = await pdfDoc.embedPng(pngBytes);
  } else {
    // Render to canvas to produce standard JPEG bytes
    const canvas = document.createElement('canvas');
    const imageObj = new Image();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      imageObj.onload = resolve;
      imageObj.onerror = reject;
      imageObj.src = url;
    });
    canvas.width = imageObj.naturalWidth;
    canvas.height = imageObj.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageObj, 0, 0);
    URL.revokeObjectURL(url);
    const jpegBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', options.quality ? options.quality / 100 : 0.92));
    const jpgBytes = await jpegBlob.arrayBuffer();
    img = await pdfDoc.embedJpg(jpgBytes);
  }

  const orientation = options.orientation || 'portrait';
  const isA4 = options.pageSize !== 'letter';
  let pageWidth = orientation === 'landscape' ? (isA4 ? 841.89 : 792) : (isA4 ? 595.28 : 612);
  let pageHeight = orientation === 'landscape' ? (isA4 ? 595.28 : 612) : (isA4 ? 841.89 : 792);

  if (options.pageSize === 'fit') {
    pageWidth = img.width;
    pageHeight = img.height;
  }

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const margin = options.pageSize === 'fit' ? 0 : 36;
  const availW = pageWidth - margin * 2;
  const availH = pageHeight - margin * 2;
  const scale = Math.min(availW / img.width, availH / img.height, 1);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const posX = (pageWidth - drawW) / 2;
  const posY = (pageHeight - drawH) / 2;

  page.drawImage(img, { x: posX, y: posY, width: drawW, height: drawH });
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

// 2. Text / Markdown / Code / JSON → Real Multi-page PDF
async function convertTextToPdf(baseName, text, options = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const orientation = options.orientation || 'portrait';
  const isA4 = options.pageSize !== 'letter';
  const pageWidth = orientation === 'landscape' ? (isA4 ? 841.89 : 792) : (isA4 ? 595.28 : 612);
  const pageHeight = orientation === 'landscape' ? (isA4 ? 595.28 : 612) : (isA4 ? 841.89 : 792);

  const margin = 48;
  const fontSize = 10;
  const lineHeight = 14;
  const maxLineChars = Math.floor((pageWidth - margin * 2) / 6);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNum = 1;

  const drawHeader = () => {
    if (options.includeHeader !== false) {
      page.drawText(baseName, { x: margin, y: pageHeight - 30, size: 9, font: boldFont, color: rgb(0.35, 0.35, 0.45) });
      page.drawLine({
        start: { x: margin, y: pageHeight - 34 },
        end: { x: pageWidth - margin, y: pageHeight - 34 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.85)
      });
    }
  };

  const drawFooter = () => {
    page.drawText(`Page ${pageNum}`, { x: pageWidth / 2 - 16, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  };

  drawHeader();

  // Title Header on Page 1
  page.drawText(baseName, { x: margin, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
  y -= 26;

  const rawLines = (text || '').split('\n');
  for (const rawLine of rawLines) {
    const words = rawLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxLineChars) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (y < margin + 25) {
          drawFooter();
          pageNum++;
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          drawHeader();
          y = pageHeight - margin - 20;
        }
        page.drawText(currentLine || ' ', { x: margin, y, size: fontSize, font: monoFont, color: rgb(0.18, 0.18, 0.22) });
        y -= lineHeight;
        currentLine = word;
      }
    }

    if (currentLine.length > 0 || rawLine === '') {
      if (y < margin + 25) {
        drawFooter();
        pageNum++;
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        drawHeader();
        y = pageHeight - margin - 20;
      }
      page.drawText(currentLine || ' ', { x: margin, y, size: fontSize, font: monoFont, color: rgb(0.18, 0.18, 0.22) });
      y -= lineHeight;
    }
  }

  drawFooter();
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

// 3. Text / Markdown / Code → Real Valid OpenXML DOCX Package
async function generateRealDocx(baseName, text) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  const lines = (text || '').split('\n');
  const paragraphs = lines.map(line => {
    const clean = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const isHeader = line.startsWith('# ') || line.startsWith('## ');
    const sz = line.startsWith('# ') ? '32' : line.startsWith('## ') ? '26' : '22';
    const bold = isHeader ? '<w:b/>' : '';
    const textContent = clean.replace(/^#+\s*/, '') || ' ';
    return `<w:p>
      <w:pPr><w:rPr>${bold}<w:sz w:val="${sz}"/></w:rPr></w:pPr>
      <w:r><w:rPr>${bold}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${textContent}</w:t></w:r>
    </w:p>`;
  }).join('');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${baseName}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t> </w:t></w:r></w:p>
    ${paragraphs}
    <w:p><w:r><w:t> </w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:rPr><w:i/><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr><w:t>Converted by StorageBank Format Studio &bull; ${new Date().toLocaleDateString()}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

// 4. Image ↔ Image (PNG, JPEG, WEBP) via Canvas
async function convertImageToImage(blob, targetFormat, options = {}) {
  const quality = options.quality ? options.quality / 100 : 0.92;
  const mime = (targetFormat === 'jpeg' || targetFormat === 'jpg')
    ? 'image/jpeg'
    : targetFormat === 'webp'
    ? 'image/webp'
    : 'image/png';

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error('Canvas export failed'));
      }, mime, quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load source image'));
    };
    img.src = url;
  });
}

// 5. JSON ↔ CSV Converters
function convertJsonToCsv(jsonText, delimiter = ',') {
  const parsed = JSON.parse(jsonText);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0) return 'empty';

  const headers = Array.from(new Set(items.flatMap(obj => typeof obj === 'object' && obj !== null ? Object.keys(obj) : ['value'])));
  const escapeCell = val => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [
    headers.map(escapeCell).join(delimiter),
    ...items.map(row => {
      if (typeof row !== 'object' || row === null) return escapeCell(row);
      return headers.map(h => escapeCell(row[h])).join(delimiter);
    })
  ];
  return rows.join('\n');
}

function convertCsvToJson(csvText, delimiter = ',') {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return '[]';
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = [];
    let insideQuotes = false;
    let curr = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        values.push(curr.trim());
        curr = '';
      } else {
        curr += char;
      }
    }
    values.push(curr.trim());
    const obj = {};
    headers.forEach((h, i) => {
      let val = values[i] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
      if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      obj[h] = val;
    });
    return obj;
  });
  return JSON.stringify(rows, null, 2);
}

// 6. Markdown → Semantic HTML
function convertMarkdownToHtml(baseName, mdText) {
  const safeText = mdText || '';
  const lines = safeText.split('\n');
  const bodyHtml = lines.map(line => {
    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith('- ') || line.startsWith('* ')) return `<li>${line.slice(2)}</li>`;
    if (line.startsWith('> ')) return `<blockquote>${line.slice(2)}</blockquote>`;
    if (line.startsWith('```')) return line.replace(/```[a-z]*/g, '');
    if (!line.trim()) return '<br/>';
    return `<p>${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')}</p>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${baseName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; background: #ffffff; }
    h1, h2, h3 { color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    blockquote { border-left: 4px solid #6366f1; padding-left: 14px; margin: 16px 0; color: #64748b; font-style: italic; }
    code, pre { font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #94a3b8; }
  </style>
</head>
<body>
  ${bodyHtml}
  <footer>Converted by StorageBank Format Studio &bull; ${new Date().toLocaleDateString()}</footer>
</body>
</html>`;
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export function ConverterStudioPage() {
  const { files, uploadFiles, addToast, logActivity } = useStorage();

  const [selectedFile, setSelectedFile] = useState(null);
  const [targetFormat, setTargetFormat] = useState('pdf');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [converting, setConverting] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [lastConvertedItem, setLastConvertedItem] = useState(null);

  // Conversion Options State
  const [pdfOrientation, setPdfOrientation] = useState('portrait');
  const [pdfPageSize, setPdfPageSize] = useState('a4');
  const [pdfIncludeHeader, setPdfIncludeHeader] = useState(true);
  const [imageQuality, setImageQuality] = useState(90);
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  const [jsonPretty, setJsonPretty] = useState(true);

  // Session items
  const [sessionItems, setSessionItems] = useState(loadSession);

  useEffect(() => {
    saveSession(sessionItems);
  }, [sessionItems]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getAllConvertedBlobs();
      if (cancelled || stored.length === 0) return;
      const blobMap = {};
      stored.forEach(entry => {
        if (entry?.id && entry?.file) blobMap[entry.id] = entry.file;
      });
      setSessionItems(prev => prev.map(item =>
        blobMap[item.id] ? { ...item, fileObj: blobMap[item.id] } : item
      ));
    })();
    return () => { cancelled = true; };
  }, []);

  const vaultFiles = useMemo(() => files.filter(f => {
    if (f.inTrash) return false;
    return f.name.toLowerCase().includes(vaultSearch.toLowerCase());
  }), [files, vaultSearch]);

  const filteredFormats = useMemo(() => {
    if (categoryFilter === 'all') return FORMATS;
    return FORMATS.filter(f => f.category === categoryFilter);
  }, [categoryFilter]);

  const handleSelectVaultFile = (f) => {
    setSelectedFile({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      blob: f.blob,
      content: f.content,
      category: f.category || (f.type?.startsWith('image/') ? 'image' : 'document')
    });
    setLastConvertedItem(null);
  };

  const handleSelectLocal = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelectedFile({
      id: `local-${Date.now()}`,
      name: f.name,
      size: f.size,
      type: f.type,
      blob: f,
      category: f.type.startsWith('image/') ? 'image' : 'document'
    });
    setLastConvertedItem(null);
    e.target.value = '';
  };

  // ── REAL CONVERSION EXECUTION ────────────────────────────────────────────────
  const executeConversion = async () => {
    if (!selectedFile || converting) return;
    setConverting(true);

    try {
      const fmt = targetFormat.toLowerCase();
      const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
      const newName = `${baseName}.${fmt === 'jpeg' ? 'jpg' : fmt}`;
      const mime = MIME_MAP[fmt] || 'application/octet-stream';
      let outBlob;

      const isSourceImage = selectedFile.category === 'image' || selectedFile.type?.startsWith('image/');
      const isTargetImage = ['png', 'jpeg', 'jpg', 'webp'].includes(fmt);

      // Extract text content if available
      let textContent = '';
      if (!isSourceImage) {
        if (typeof selectedFile.content === 'string') {
          textContent = selectedFile.content;
        } else if (selectedFile.blob) {
          textContent = await selectedFile.blob.text();
        }
      }

      // Route to real conversion engines
      if (fmt === 'pdf') {
        if (isSourceImage && selectedFile.blob) {
          outBlob = await convertImageToPdf(selectedFile.blob, baseName, {
            orientation: pdfOrientation,
            pageSize: pdfPageSize,
            quality: imageQuality
          });
        } else {
          outBlob = await convertTextToPdf(baseName, textContent, {
            orientation: pdfOrientation,
            pageSize: pdfPageSize,
            includeHeader: pdfIncludeHeader
          });
        }
      } else if (fmt === 'docx') {
        outBlob = await generateRealDocx(baseName, textContent);
      } else if (isTargetImage) {
        if (isSourceImage && selectedFile.blob) {
          outBlob = await convertImageToImage(selectedFile.blob, fmt, { quality: imageQuality });
        } else {
          // Render text content onto canvas
          const canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 1600;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(0, 0, 1200, 1600);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px monospace';
          ctx.fillText(baseName, 60, 80);
          ctx.font = '20px monospace';
          ctx.fillStyle = '#94a3b8';
          const lines = (textContent || '').split('\n').slice(0, 50);
          lines.forEach((l, i) => ctx.fillText(l.slice(0, 80), 60, 140 + i * 28));
          outBlob = await new Promise(res => canvas.toBlob(res, MIME_MAP[fmt], imageQuality / 100));
        }
      } else if (fmt === 'html') {
        const htmlStr = convertMarkdownToHtml(baseName, textContent);
        outBlob = new Blob([htmlStr], { type: 'text/html' });
      } else if (fmt === 'csv') {
        const csvStr = selectedFile.name.endsWith('.json')
          ? convertJsonToCsv(textContent, csvDelimiter)
          : textContent;
        outBlob = new Blob([csvStr], { type: 'text/csv' });
      } else if (fmt === 'json') {
        const jsonStr = (selectedFile.name.endsWith('.csv') || textContent.includes(','))
          ? convertCsvToJson(textContent, csvDelimiter)
          : (jsonPretty ? JSON.stringify(JSON.parse(textContent || '{}'), null, 2) : textContent);
        outBlob = new Blob([jsonStr], { type: 'application/json' });
      } else if (fmt === 'md' || fmt === 'txt') {
        outBlob = new Blob([textContent], { type: MIME_MAP[fmt] });
      } else {
        outBlob = new Blob([textContent], { type: mime });
      }

      const fileObj = new File([outBlob], newName, { type: mime });
      const itemId = `conv-${Date.now()}`;

      // Persist blob to IndexedDB
      await saveConvertedBlob(itemId, fileObj);

      const newItem = {
        id: itemId,
        originalName: selectedFile.name,
        convertedName: newName,
        format: fmt,
        size: outBlob.size,
        timestamp: new Date().toISOString(),
        fileObj,
        savedToVault: false,
        fromVault: false
      };

      setSessionItems(prev => [newItem, ...prev]);
      setLastConvertedItem(newItem);
      addToast(`Converted "${selectedFile.name}" to .${fmt.toUpperCase()}`, 'success');
      logActivity('CONVERT', `Converted to ${newName}`, 'success');

    } catch (err) {
      console.error('Conversion failed:', err);
      addToast(`Conversion error: ${err.message}`, 'error');
    } finally {
      setConverting(false);
    }
  };

  const handleSaveToVault = async (item) => {
    let fileToSave = item.fileObj;
    if (!fileToSave) fileToSave = await getConvertedBlob(item.id);
    if (!fileToSave) {
      addToast('File data not found — please re-convert.', 'warning');
      return;
    }

    const blobToSave = {
      name: item.convertedName,
      type: fileToSave.type || 'application/octet-stream',
      blob: fileToSave,
      size: fileToSave.size,
      tags: ['Converted']
    };

    await uploadFiles([blobToSave], null);
    setSessionItems(prev => prev.map(c => c.id === item.id ? { ...c, savedToVault: true, fileObj: fileToSave } : c));
    if (lastConvertedItem?.id === item.id) {
      setLastConvertedItem(prev => ({ ...prev, savedToVault: true }));
    }
    addToast(`Saved "${item.convertedName}" to Vault!`, 'success');
  };

  const handleDownload = async (item) => {
    let file = item.fileObj;
    if (!file) file = await getConvertedBlob(item.id);
    if (!file) {
      addToast('File data not found — please re-convert.', 'warning');
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.convertedName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDelete = (item) => {
    setSessionItems(prev => prev.filter(c => c.id !== item.id));
    deleteConvertedBlob(item.id);
    if (lastConvertedItem?.id === item.id) setLastConvertedItem(null);
    addToast('Removed from history.', 'info');
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '16px' }}>

      {/* Header */}
      <div className="glass-panel" style={{
        borderRadius: '10px',
        padding: '18px 24px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'var(--accent-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <RefreshCw size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
              Format Converter Studio
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Real browser-native conversion with live formatting options and vault sync.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.74rem', padding: '3px 10px', borderRadius: '20px', background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
            {sessionItems.length} converted files
          </span>
        </div>
      </div>

      {/* Main Grid: Vault Picker & Converter Options */}
      <div className="converter-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '20px', marginBottom: '24px' }}>

        {/* Left Column: Select File from Vault / Computer */}
        <div className="glass-panel" style={{
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '680px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={15} color="var(--accent-primary)" /> Select Source File
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{vaultFiles.length} available</span>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-text"
              placeholder="Filter vault files..."
              value={vaultSearch}
              onChange={e => setVaultSearch(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '0.8rem', padding: '7px 10px 7px 32px' }}
            />
          </div>

          {/* Vault Files List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {vaultFiles.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No files matching search in vault.
              </div>
            ) : vaultFiles.map(f => {
              const isSelected = selectedFile?.id === f.id;
              const fStyle = getFileColorStyle(f);
              return (
                <div
                  key={f.id}
                  onClick={() => handleSelectVaultFile(f)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '7px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input)',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{
                      fontSize: '0.62rem',
                      fontWeight: '700',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      background: fStyle.bg,
                      color: fStyle.color,
                      border: `1px solid ${fStyle.border}`,
                      fontFamily: 'var(--font-mono)',
                      flexShrink: 0
                    }}>
                      {fStyle.label}
                    </span>
                    <span style={{ fontWeight: '500', fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '2px' }}>
                    <span>{f.category}</span>
                    <span>{formatSize(f.size)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upload From Computer */}
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              className="btn btn-secondary"
              onClick={() => document.getElementById('__cvtr_file_input').click()}
              style={{ width: '100%', fontSize: '0.8rem', gap: '6px' }}
            >
              <Upload size={14} /> Upload Local Computer File
            </button>
            <input
              id="__cvtr_file_input"
              type="file"
              onChange={handleSelectLocal}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Right Column: Converter Workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Active Source File Card */}
          <div className="glass-panel" style={{ borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Active Source
            </div>
            {!selectedFile ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.84rem',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '8px'
              }}>
                Select a file from your Vault on the left or upload a file from your computer to begin.
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                {(() => {
                  const srcStyle = getFileColorStyle(selectedFile);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: srcStyle.bg,
                        color: srcStyle.color,
                        border: `1px solid ${srcStyle.border}`,
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0
                      }}>
                        {srcStyle.label}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {formatSize(selectedFile.size)} &bull; {selectedFile.category || 'File'}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-indigo">Source Ready</span>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => { setSelectedFile(null); setLastConvertedItem(null); }}
                    style={{ padding: '4px', height: '26px', width: '26px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Target Format Grid & Customization Options */}
          <div className="glass-panel" style={{ borderRadius: '10px', padding: '18px' }}>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileType size={16} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '0.92rem', fontWeight: '600', margin: 0 }}>Target Format</h3>
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                {['all', 'document', 'image', 'data'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '16px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      textTransform: 'capitalize',
                      background: categoryFilter === cat ? 'var(--accent-primary)' : 'var(--bg-input)',
                      color: categoryFilter === cat ? '#ffffff' : 'var(--text-muted)'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Formats Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '10px',
              marginBottom: '18px'
            }}>
              {filteredFormats.map(fmt => {
                const isSelected = targetFormat === fmt.key;
                return (
                  <div
                    key={fmt.key}
                    onClick={() => setTargetFormat(fmt.key)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99, 102, 241, 0.16)' : 'var(--bg-input)',
                      border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                        {fmt.label}
                      </span>
                      <span style={{ fontSize: '0.66rem', fontWeight: '800', color: 'var(--accent-primary)' }}>
                        {fmt.ext}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                      {fmt.desc}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Real Format Options Panel with Modern Segmented Controls */}
            <div style={{
              background: 'var(--bg-input)',
              borderRadius: '8px',
              padding: '14px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px' }}>
                <SlidersHorizontal size={13} color="var(--accent-primary)" />
                <span>Conversion Settings ({targetFormat.toUpperCase()})</span>
              </div>

              {targetFormat === 'pdf' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                  {/* Page Size Segmented Control */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600 }}>PAGE SIZE:</span>
                    <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                      {[
                        { id: 'a4', label: 'A4 Standard' },
                        { id: 'letter', label: 'US Letter' },
                        { id: 'fit', label: 'Fit Canvas' }
                      ].map(sz => (
                        <button
                          key={sz.id}
                          type="button"
                          onClick={() => setPdfPageSize(sz.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '5px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            background: pdfPageSize === sz.id ? 'var(--accent-primary)' : 'transparent',
                            color: pdfPageSize === sz.id ? '#ffffff' : 'var(--text-secondary)',
                            transition: 'var(--transition-fast)'
                          }}
                        >
                          {sz.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Orientation Segmented Control */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600 }}>LAYOUT:</span>
                    <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                      {[
                        { id: 'portrait', label: 'Portrait' },
                        { id: 'landscape', label: 'Landscape' }
                      ].map(or => (
                        <button
                          key={or.id}
                          type="button"
                          onClick={() => setPdfOrientation(or.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '5px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            background: pdfOrientation === or.id ? 'var(--accent-primary)' : 'transparent',
                            color: pdfOrientation === or.id ? '#ffffff' : 'var(--text-secondary)',
                            transition: 'var(--transition-fast)'
                          }}
                        >
                          {or.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Header / Page Number Pill */}
                  <button
                    type="button"
                    onClick={() => setPdfIncludeHeader(!pdfIncludeHeader)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '7px',
                      background: pdfIncludeHeader ? 'rgba(99, 102, 241, 0.16)' : 'var(--bg-secondary)',
                      border: pdfIncludeHeader ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: pdfIncludeHeader ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: '0.73rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Check size={12} opacity={pdfIncludeHeader ? 1 : 0.4} />
                    <span>Header &amp; Page Numbers</span>
                  </button>
                </div>
              )}

              {['jpeg', 'jpg', 'webp'].includes(targetFormat) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600 }}>COMPRESSION QUALITY</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{imageQuality}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                      {[
                        { q: 70, label: '70% Web' },
                        { q: 85, label: '85% Balanced' },
                        { q: 95, label: '95% High' }
                      ].map(p => (
                        <button
                          key={p.q}
                          type="button"
                          onClick={() => setImageQuality(p.q)}
                          style={{
                            padding: '4px 9px',
                            borderRadius: '5px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            background: imageQuality === p.q ? 'var(--accent-primary)' : 'transparent',
                            color: imageQuality === p.q ? '#ffffff' : 'var(--text-secondary)'
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      step="5"
                      value={imageQuality}
                      onChange={e => setImageQuality(Number(e.target.value))}
                      style={{ flex: 1, minWidth: '130px', accentColor: 'var(--accent-primary)', height: '4px' }}
                    />
                  </div>
                </div>
              )}

              {targetFormat === 'png' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  PNG utilizes lossless 24-bit canvas encoding with alpha transparency preservation.
                </div>
              )}

              {targetFormat === 'csv' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600 }}>DELIMITER:</span>
                  <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                    {[
                      { key: ',', label: 'Comma (,)' },
                      { key: ';', label: 'Semicolon (;)' },
                      { key: '\t', label: 'Tab (\\t)' }
                    ].map(d => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setCsvDelimiter(d.key)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '5px',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          background: csvDelimiter === d.key ? 'var(--accent-primary)' : 'transparent',
                          color: csvDelimiter === d.key ? '#ffffff' : 'var(--text-secondary)'
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {targetFormat === 'json' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600 }}>FORMATTING:</span>
                  <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                    {[
                      { key: true, label: 'Pretty Print (2-Space)' },
                      { key: false, label: 'Minified (1-Line)' }
                    ].map(j => (
                      <button
                        key={String(j.key)}
                        type="button"
                        onClick={() => setJsonPretty(j.key)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '5px',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          background: jsonPretty === j.key ? 'var(--accent-primary)' : 'transparent',
                          color: jsonPretty === j.key ? '#ffffff' : 'var(--text-secondary)'
                        }}
                      >
                        {j.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {['docx', 'html', 'md', 'txt'].includes(targetFormat) && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {targetFormat === 'docx' && 'Generates compliant Office Open XML with bold titles and styled paragraph nodes.'}
                  {targetFormat === 'html' && 'Generates standard HTML5 document with responsive system font typography.'}
                  {['md', 'txt'].includes(targetFormat) && 'Clean plain-text conversion preserving character encodings and line breaks.'}
                </div>
              )}
            </div>

            {/* Execute Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-primary"
                onClick={executeConversion}
                disabled={!selectedFile || converting}
                style={{ padding: '9px 24px', fontSize: '0.86rem', fontWeight: '600', borderRadius: '8px' }}
              >
                {converting ? 'Converting file...' : `Convert to .${targetFormat.toUpperCase()}`}
              </button>
            </div>
          </div>

          {/* Last Converted Result Quick Action Bar */}
          {lastConvertedItem && (
            <div className="glass-panel" style={{
              borderRadius: '10px',
              padding: '14px 18px',
              border: '1px solid var(--accent-emerald)',
              background: 'rgba(16, 185, 129, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={18} color="var(--accent-emerald)" />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    {lastConvertedItem.convertedName}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Ready &bull; {formatSize(lastConvertedItem.size)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleDownload(lastConvertedItem)}
                  style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
                >
                  <Download size={13} /> Download
                </button>
                {!lastConvertedItem.savedToVault && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleSaveToVault(lastConvertedItem)}
                    style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
                  >
                    <HardDrive size={13} /> Save to Vault
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setPreviewItem(lastConvertedItem)}
                  style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
                >
                  <Eye size={13} /> Preview
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* History Table */}
      <div className="glass-panel" style={{ borderRadius: '10px', padding: '18px' }}>
        <h3 style={{ fontSize: '0.94rem', fontWeight: '600', marginBottom: '14px', color: 'var(--text-primary)' }}>
          Converted History ({sessionItems.length})
        </h3>

        {sessionItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            No converted files yet in this session. Convert a file above to view history.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>File Name</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Original Source</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Format</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Size</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Vault Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessionItems.map(item => {
                  const itemStyle = getFileColorStyle(item.convertedName);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: '700',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            background: itemStyle.bg,
                            color: itemStyle.color,
                            border: `1px solid ${itemStyle.border}`,
                            fontFamily: 'var(--font-mono)',
                            flexShrink: 0
                          }}>
                            {itemStyle.label}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.convertedName}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {item.originalName}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: '0.66rem',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: itemStyle.bg,
                          color: itemStyle.color,
                          border: `1px solid ${itemStyle.border}`,
                          textTransform: 'uppercase'
                        }}>
                          {item.format}
                        </span>
                      </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                      {formatSize(item.size)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {item.savedToVault ? (
                        <span style={{ color: 'var(--accent-emerald)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={12} /> In Vault
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Local Only</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          className="btn btn-ghost btn-icon"
                          title="Preview"
                          onClick={() => setPreviewItem(item)}
                          style={{ padding: '4px', height: '28px', width: '28px' }}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon"
                          title="Download"
                          onClick={() => handleDownload(item)}
                          style={{ padding: '4px', height: '28px', width: '28px' }}
                        >
                          <Download size={14} />
                        </button>
                        {!item.savedToVault && (
                          <button
                            className="btn btn-ghost btn-icon"
                            title="Save to Vault"
                            onClick={() => handleSaveToVault(item)}
                            style={{ padding: '4px', height: '28px', width: '28px' }}
                          >
                            <HardDrive size={14} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-icon"
                          title="Delete from history"
                          onClick={() => handleDelete(item)}
                          style={{ padding: '4px', height: '28px', width: '28px', color: 'var(--accent-rose)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="glass-panel"
            onClick={e => e.stopPropagation()}
            style={{
              borderRadius: '10px',
              padding: '20px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '0.96rem', fontWeight: '700', margin: 0 }}>
                {previewItem.convertedName}
              </h3>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setPreviewItem(null)}
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              borderRadius: '6px',
              background: 'var(--bg-input)',
              padding: '12px',
              minHeight: '200px'
            }}>
              <PreviewContent item={previewItem} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={() => { handleDownload(previewItem); setPreviewItem(null); }}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                <Download size={13} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewContent({ item }) {
  const [content, setContent] = useState(null);

  useEffect(() => {
    if (!item?.fileObj) return;
    let createdUrl = null;
    const fmt = item.format.toLowerCase();

    if (['png', 'jpeg', 'jpg', 'webp'].includes(fmt)) {
      createdUrl = URL.createObjectURL(item.fileObj);
      setContent({ type: 'image', url: createdUrl });
    } else if (fmt === 'pdf') {
      createdUrl = URL.createObjectURL(item.fileObj);
      setContent({ type: 'pdf', url: createdUrl });
    } else {
      item.fileObj.text().then(t => setContent({ type: 'text', text: t })).catch(() => {
        setContent({ type: 'text', text: '[Binary file format — click download to view]' });
      });
    }

    return () => {
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [item]);

  if (!content) {
    return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Loading file...</div>;
  }

  if (content.type === 'image') {
    return (
      <img
        src={content.url}
        alt={item.convertedName}
        style={{ maxWidth: '100%', maxHeight: '400px', margin: '0 auto', display: 'block', borderRadius: '4px' }}
      />
    );
  }

  if (content.type === 'pdf') {
    return (
      <iframe
        src={content.url}
        title={item.convertedName}
        style={{ width: '100%', height: '400px', border: 'none', borderRadius: '4px' }}
      />
    );
  }

  return (
    <pre style={{
      fontSize: '0.78rem',
      color: 'var(--text-primary)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      margin: 0,
      fontFamily: 'monospace'
    }}>
      {content.text}
    </pre>
  );
}
