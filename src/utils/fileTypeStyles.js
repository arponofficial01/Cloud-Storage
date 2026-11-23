/**
 * Unified file type styling and color-coding for StorageBank
 * Provides distinct, professional matte colors and labels for all document and media types.
 */
export function getFileColorStyle(file) {
  const name = typeof file === 'string' ? file : (file?.name || file?.webkitRelativePath || file?.convertedName || '');
  const mime = typeof file === 'object' ? (file?.type || '') : '';
  const ext = name.split('.').pop()?.toLowerCase() || '';

  // PDFs: Crimson / Red
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { color: '#ef4444', label: 'PDF', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)' };
  }
  // Word Documents: Classic Blue
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) {
    return { color: '#3b82f6', label: 'DOCX', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)' };
  }
  // Spreadsheets: Emerald / Green
  if (['csv', 'xlsx', 'xls', 'ods'].includes(ext)) {
    return { color: '#10b981', label: ext.toUpperCase(), bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)' };
  }
  // Presentations: Orange
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return { color: '#f97316', label: 'PPTX', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.35)' };
  }
  // Markdown: Violet / Purple
  if (['md', 'markdown'].includes(ext)) {
    return { color: '#8b5cf6', label: 'MD', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.35)' };
  }
  // Plain Text / Logs: Sky Blue
  if (['txt', 'log'].includes(ext)) {
    return { color: '#0ea5e9', label: 'TXT', bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.35)' };
  }
  // JSON: Magenta / Pink
  if (ext === 'json') {
    return { color: '#ec4899', label: 'JSON', bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.35)' };
  }
  // JavaScript / TypeScript: Amber / Gold
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
    return { color: '#f59e0b', label: ext.toUpperCase(), bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)' };
  }
  // Python: Cyan
  if (ext === 'py') {
    return { color: '#06b6d4', label: 'PYTHON', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.35)' };
  }
  // Web / Markup / Shell: Rose / Coral
  if (['html', 'css', 'sql', 'sh', 'xml', 'yaml', 'yml'].includes(ext)) {
    return { color: '#f43f5e', label: ext.toUpperCase(), bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.35)' };
  }
  // Archives: Warm Gold
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return { color: '#eab308', label: 'ARCHIVE', bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.35)' };
  }
  // Audio: Amber
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext) || mime.startsWith('audio/')) {
    return { color: '#f59e0b', label: 'AUDIO', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)' };
  }
  // Video: Fuchsia
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext) || mime.startsWith('video/')) {
    return { color: '#d946ef', label: 'VIDEO', bg: 'rgba(217, 70, 239, 0.12)', border: 'rgba(217, 70, 239, 0.35)' };
  }
  // Images: Cyan / Sky
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext) || mime.startsWith('image/')) {
    return { color: '#38bdf8', label: 'IMAGE', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.35)' };
  }
  // Generic Fallback
  return { color: 'var(--text-muted)', label: ext.toUpperCase() || 'FILE', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.25)' };
}

