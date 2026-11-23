import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStorage } from '../context/StorageContext';
import {
  X,
  RotateCw,
  Download,
  FlipHorizontal,
  FlipVertical,
  Save,
  Sliders,
  Crop,
  RotateCcw,
  Check,
  Scissors,
  Camera,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Gauge,
  Loader2,
  Film
} from 'lucide-react';

const FILTER_PRESETS = [
  { name: 'Original', brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0 },
  { name: 'Cinema Matte', brightness: 98, contrast: 118, saturate: 88, grayscale: 0, sepia: 10 },
  { name: 'Vivid HDR', brightness: 105, contrast: 115, saturate: 135, grayscale: 0, sepia: 0 },
  { name: 'Noir B&W', brightness: 102, contrast: 125, saturate: 0, grayscale: 100, sepia: 0 },
  { name: 'Warm Vintage', brightness: 104, contrast: 95, saturate: 90, grayscale: 0, sepia: 40 }
];

export function MediaEditorModal({ file, isOpen, onClose }) {
  const { saveFile, replaceFile, reloadVault, addToast, logActivity, ensureFileBlob } = useStorage();

  const isVideo =
    file?.category === 'video' ||
    file?.type?.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes((file?.name?.split('.').pop() || '').toLowerCase());
  const isImage = !isVideo;

  const [activeTab, setActiveTab] = useState(isVideo ? 'trim' : 'adjust'); // 'trim' | 'adjust' | 'transform' | 'crop'

  // Shared Visual Filters (Image & Video)
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [blur, setBlur] = useState(0);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [invert, setInvert] = useState(0);

  // Shared Transformations
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Interactive Drag & Drop Crop State (stored in normalized percentages 0..100 of the canvas)
  const [cropAspect, setCropAspect] = useState('free'); // 'free' | '1:1' | '16:9' | '4:3'
  const [cropBox, setCropBox] = useState({ x: 10, y: 10, w: 80, h: 80 });
  // committedCrop stores the applied crop in source image pixel coordinates { sx, sy, sw, sh } or null
  const [committedCrop, setCommittedCrop] = useState(null);
  const [cropDragAction, setCropDragAction] = useState(null); // { mode: 'move'|'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w'|'draw', startX, startY, startBox }

  // Video Editing State
  const [videoDuration, setVideoDuration] = useState(0);
  const [_currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoMuted, setVideoMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Save State
  const [saveMode, setSaveMode] = useState('replace'); // 'replace' | 'new'
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(null);

  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const imageObjRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    if (!file || !isOpen) return;

    const loadBlob = async () => {
      try {
        let b = file.blob;
        if (!(b instanceof Blob) && typeof ensureFileBlob === 'function') {
          b = await ensureFileBlob(file);
        }
        if (cancelled) return;
        if (b instanceof Blob) {
          url = URL.createObjectURL(b);
          setMediaUrl(url);
        }
      } catch (err) {
        console.warn('Failed to create Media Blob URL:', err);
      }
    };

    loadBlob();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, isOpen, ensureFileBlob]);

  useEffect(() => {
    if (isOpen) {
      setBrightness(100);
      setContrast(100);
      setSaturate(100);
      setBlur(0);
      setGrayscale(0);
      setSepia(0);
      setInvert(0);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCropAspect('free');
      setCropBox({ x: 10, y: 10, w: 80, h: 80 });
      setCommittedCrop(null);
      setCropDragAction(null);
      setActiveTab(isVideo ? 'trim' : 'adjust');
      setSaveMode(isVideo ? 'new' : 'replace');
      setPlaybackSpeed(1);
      setVideoMuted(false);
      setRenderProgress(0);
    }
  }, [isOpen, isVideo]);

  const resetAllAdjustments = () => {
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setBlur(0);
    setGrayscale(0);
    setSepia(0);
    setInvert(0);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCropAspect('free');
    setCropBox({ x: 10, y: 10, w: 80, h: 80 });
    setCommittedCrop(null);
    setPlaybackSpeed(1);
    setVideoMuted(false);
    if (videoDuration > 0) {
      setTrimStart(0);
      setTrimEnd(videoDuration);
    }
    addToast('Reset all adjustments to default', 'info');
  };

  const applyPreset = (p) => {
    setBrightness(p.brightness);
    setContrast(p.contrast);
    setSaturate(p.saturate);
    setGrayscale(p.grayscale);
    setSepia(p.sepia);
  };

  const getFilterCSS = useCallback(() => {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blur}px) grayscale(${grayscale}%) sepia(${sepia}%) invert(${invert}%)`;
  }, [brightness, contrast, saturate, blur, grayscale, sepia, invert]);

  // ── IMAGE CANVAS RENDERING ────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');

    const sx = committedCrop ? committedCrop.sx : 0;
    const sy = committedCrop ? committedCrop.sy : 0;
    const sw = committedCrop ? committedCrop.sw : img.width;
    const sh = committedCrop ? committedCrop.sh : img.height;

    const isQuarterTurn = (rotation / 90) % 2 !== 0;
    const outW = isQuarterTurn ? sh : sw;
    const outH = isQuarterTurn ? sw : sh;

    canvas.width = Math.max(1, outW);
    canvas.height = Math.max(1, outH);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = getFilterCSS();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }, [committedCrop, rotation, flipH, flipV, getFilterCSS]);

  useEffect(() => {
    if (!isImage || !mediaUrl || !isOpen) return;
    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mediaUrl;
    img.onload = () => {
      if (!isMounted) return;
      imageObjRef.current = img;
      renderCanvas();
    };
    return () => {
      isMounted = false;
    };
  }, [mediaUrl, isImage, isOpen, renderCanvas]);

  useEffect(() => {
    if (isImage && imageObjRef.current && isOpen) {
      renderCanvas();
    }
  }, [brightness, contrast, saturate, blur, grayscale, sepia, invert, rotation, flipH, flipV, committedCrop, renderCanvas, isImage, isOpen]);

  // ── INTERACTIVE DRAG & DROP CROP SYSTEM ───────────────────────────────────
  const handleSelectAspect = (asp) => {
    setCropAspect(asp);
    const canvas = canvasRef.current;
    if (!canvas || asp === 'free') return;

    const cw = canvas.clientWidth || canvas.width || 1;
    const ch = canvas.clientHeight || canvas.height || 1;
    const targetRatio = asp === '1:1' ? 1 : asp === '16:9' ? 16 / 9 : 4 / 3;

    // Fit box of targetRatio centered inside canvas
    let boxW = 75;
    let boxH = (boxW * (cw / ch)) / targetRatio;
    if (boxH > 75) {
      boxH = 75;
      boxW = (boxH * targetRatio) / (cw / ch);
    }
    setCropBox({
      x: Math.max(0, (100 - boxW) / 2),
      y: Math.max(0, (100 - boxH) / 2),
      w: Math.min(100, boxW),
      h: Math.min(100, boxH)
    });
  };

  const getPointerPct = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { px: 0, py: 0, cw: 1, ch: 1 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const px = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const py = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
    return {
      px: Math.max(0, Math.min(100, px)),
      py: Math.max(0, Math.min(100, py)),
      cw: Math.max(1, rect.width),
      ch: Math.max(1, rect.height)
    };
  };

  const startCropInteraction = (e, mode) => {
    if (!isImage || activeTab !== 'crop') return;
    e.preventDefault();
    e.stopPropagation();
    const { px, py } = getPointerPct(e);
    if (mode === 'draw') {
      const initialBox = { x: px, y: py, w: 1, h: 1 };
      setCropBox(initialBox);
      setCropDragAction({ mode: 'draw', startX: px, startY: py, startBox: initialBox });
    } else {
      setCropDragAction({ mode, startX: px, startY: py, startBox: { ...cropBox } });
    }
  };

  useEffect(() => {
    if (!cropDragAction) return;

    const handleWindowMove = (e) => {
      const { px, py, cw, ch } = getPointerPct(e);
      const dx = px - cropDragAction.startX;
      const dy = py - cropDragAction.startY;
      const sb = cropDragAction.startBox;
      const mode = cropDragAction.mode;

      let next = { ...sb };

      if (mode === 'move') {
        next.x = Math.max(0, Math.min(100 - sb.w, sb.x + dx));
        next.y = Math.max(0, Math.min(100 - sb.h, sb.y + dy));
      } else if (mode === 'draw') {
        const x1 = Math.min(cropDragAction.startX, px);
        const y1 = Math.min(cropDragAction.startY, py);
        const x2 = Math.max(cropDragAction.startX, px);
        const y2 = Math.max(cropDragAction.startY, py);
        next = {
          x: x1,
          y: y1,
          w: Math.max(5, x2 - x1),
          h: Math.max(5, y2 - y1)
        };
      } else {
        if (mode.includes('e')) next.w = Math.max(8, Math.min(100 - sb.x, sb.w + dx));
        if (mode.includes('s')) next.h = Math.max(8, Math.min(100 - sb.y, sb.h + dy));
        if (mode.includes('w')) {
          const maxShift = sb.w - 8;
          const shift = Math.max(-sb.x, Math.min(maxShift, dx));
          next.x = sb.x + shift;
          next.w = sb.w - shift;
        }
        if (mode.includes('n')) {
          const maxShift = sb.h - 8;
          const shift = Math.max(-sb.y, Math.min(maxShift, dy));
          next.y = sb.y + shift;
          next.h = sb.h - shift;
        }
      }

      // Enforce aspect ratio if selected
      if (cropAspect !== 'free' && mode !== 'move') {
        const targetRatio = cropAspect === '1:1' ? 1 : cropAspect === '16:9' ? 16 / 9 : 4 / 3;
        const desiredH = (next.w * (cw / ch)) / targetRatio;
        if (next.y + desiredH <= 100) {
          next.h = Math.max(8, desiredH);
        } else {
          next.h = 100 - next.y;
          next.w = Math.max(8, (next.h * targetRatio) / (cw / ch));
        }
      }

      setCropBox(next);
    };

    const handleWindowUp = () => {
      setCropDragAction(null);
    };

    window.addEventListener('mousemove', handleWindowMove);
    window.addEventListener('mouseup', handleWindowUp);
    window.addEventListener('touchmove', handleWindowMove, { passive: false });
    window.addEventListener('touchend', handleWindowUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);
      window.removeEventListener('touchmove', handleWindowMove);
      window.removeEventListener('touchend', handleWindowUp);
    };
  }, [cropDragAction, cropAspect]);

  const handleCommitCrop = () => {
    const img = imageObjRef.current;
    if (!img) return;

    const baseSx = committedCrop ? committedCrop.sx : 0;
    const baseSy = committedCrop ? committedCrop.sy : 0;
    const baseSw = committedCrop ? committedCrop.sw : img.width;
    const baseSh = committedCrop ? committedCrop.sh : img.height;

    const newSx = Math.round(baseSx + (cropBox.x / 100) * baseSw);
    const newSy = Math.round(baseSy + (cropBox.y / 100) * baseSh);
    const newSw = Math.max(16, Math.round((cropBox.w / 100) * baseSw));
    const newSh = Math.max(16, Math.round((cropBox.h / 100) * baseSh));

    setCommittedCrop({ sx: newSx, sy: newSy, sw: newSw, sh: newSh });
    setCropBox({ x: 10, y: 10, w: 80, h: 80 });
    addToast(`Applied crop (${newSw} × ${newSh} px)`, 'success');
  };

  // ── VIDEO CONTROLS & FRAME CAPTURE ────────────────────────────────────────
  const handleVideoLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setVideoDuration(dur);
    setTrimStart(0);
    setTrimEnd(dur);
    setCurrentTime(0);
  };

  const handleVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (trimEnd > 0 && v.currentTime >= trimEnd) {
      v.pause();
      v.currentTime = trimStart;
      setIsPlaying(false);
    }
  };

  const toggleVideoPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trimStart || (trimEnd > 0 && v.currentTime >= trimEnd)) {
        v.currentTime = trimStart;
      }
      v.playbackRate = playbackSpeed;
      v.muted = videoMuted;
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (v && isVideo) {
      v.playbackRate = playbackSpeed;
      v.muted = videoMuted;
    }
  }, [playbackSpeed, videoMuted, isVideo]);

  const formatTime = (sec) => {
    if (!sec || !Number.isFinite(sec)) return '00:00.0';
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${String(m).padStart(2, '0')}:${s.padStart(4, '0')}`;
  };

  const handleCaptureVideoFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const vw = v.videoWidth || 1280;
      const vh = v.videoHeight || 720;
      const isQuarterTurn = (rotation / 90) % 2 !== 0;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = isQuarterTurn ? vh : vw;
      offCanvas.height = isQuarterTurn ? vw : vh;
      const ctx = offCanvas.getContext('2d');

      ctx.save();
      ctx.filter = getFilterCSS();
      ctx.translate(offCanvas.width / 2, offCanvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(v, -vw / 2, -vh / 2, vw, vh);
      ctx.restore();

      const frameBlob = await new Promise(res => offCanvas.toBlob(res, 'image/png', 0.95));
      if (!frameBlob) throw new Error('Could not capture frame');

      const base = file.name.replace(/\.[^.]+$/, '');
      const frameName = `${base}_frame_${formatTime(v.currentTime).replace(/[:.]/g, '-')}.png`;

      await saveFile({
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: frameName,
        type: 'image/png',
        size: frameBlob.size,
        category: 'image',
        blob: frameBlob,
        folderId: file.folderId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['snapshot', 'image']
      });

      await reloadVault();
      addToast(`Saved HD frame "${frameName}" to Vault!`, 'success');
    } catch (err) {
      addToast('Frame capture failed: ' + err.message, 'error');
    }
  };

  const renderEditedVideoBlob = async () => {
    const v = videoRef.current;
    if (!v) throw new Error('Video element not ready');

    v.pause();
    setIsPlaying(false);

    const vw = v.videoWidth || 1280;
    const vh = v.videoHeight || 720;
    const isQuarterTurn = (rotation / 90) % 2 !== 0;

    const recCanvas = document.createElement('canvas');
    recCanvas.width = isQuarterTurn ? vh : vw;
    recCanvas.height = isQuarterTurn ? vw : vh;
    const ctx = recCanvas.getContext('2d');

    const startSec = Math.max(0, trimStart);
    const endSec = trimEnd > startSec ? trimEnd : (v.duration || 5);
    const clipDuration = Math.max(0.5, endSec - startSec);

    const stream = recCanvas.captureStream(30);

    if (!videoMuted) {
      try {
        const vStream = v.captureStream ? v.captureStream() : v.mozCaptureStream ? v.mozCaptureStream() : null;
        if (vStream) {
          const audioTracks = vStream.getAudioTracks();
          if (audioTracks.length > 0) {
            stream.addTrack(audioTracks[0]);
          }
        }
      } catch {}
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4500000 });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      let animId = null;

      recorder.onstop = () => {
        if (animId) cancelAnimationFrame(animId);
        setRenderProgress(100);
        const outBlob = new Blob(chunks, { type: mimeType.split(';')[0] });
        resolve({ blob: outBlob, mime: mimeType.split(';')[0] });
      };

      recorder.onerror = (err) => {
        if (animId) cancelAnimationFrame(animId);
        reject(err);
      };

      v.currentTime = startSec;
      v.playbackRate = playbackSpeed;
      v.muted = videoMuted;

      const drawLoop = () => {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, recCanvas.width, recCanvas.height);
        ctx.filter = getFilterCSS();
        ctx.translate(recCanvas.width / 2, recCanvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(v, -vw / 2, -vh / 2, vw, vh);
        ctx.restore();

        const elapsed = Math.max(0, v.currentTime - startSec);
        setRenderProgress(Math.min(99, Math.round((elapsed / clipDuration) * 100)));

        if (v.currentTime >= endSec || v.ended) {
          v.pause();
          if (recorder.state === 'recording') recorder.stop();
          return;
        }
        animId = requestAnimationFrame(drawLoop);
      };

      v.onseeked = () => {
        v.onseeked = null;
        recorder.start(100);
        v.play().then(() => {
          drawLoop();
        }).catch(reject);
      };
    });
  };

  const handleDownload = async () => {
    if (isVideo) {
      setSaving(true);
      try {
        const { blob } = await renderEditedVideoBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.[^.]+$/, '') + '_edited.webm';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (err) {
        addToast('Video export failed: ' + err.message, 'error');
      } finally {
        setSaving(false);
        setRenderProgress(0);
      }
      return;
    }

    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, file.type || 'image/png', 0.95);
  };

  const handleSaveToVault = async () => {
    setSaving(true);
    try {
      if (isVideo) {
        const { blob, mime } = await renderEditedVideoBlob();
        if (saveMode === 'replace') {
          await replaceFile(file.id, blob, { type: mime, size: blob.size });
          addToast(`Updated video "${file.name}" in vault`, 'success');
          if (logActivity) logActivity('EDIT', `Edited video: ${file.name}`);
        } else {
          const base = file.name.replace(/\.[^.]+$/, '');
          const newName = `${base}_edited_${Date.now()}.webm`;
          await saveFile({
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            name: newName,
            type: mime,
            size: blob.size,
            category: 'video',
            blob,
            folderId: file.folderId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: ['edited', 'video']
          });
          addToast(`Saved edited video "${newName}" to vault`, 'success');
          if (logActivity) logActivity('SAVE', `Saved edited video: ${newName}`);
        }
      } else {
        if (!canvasRef.current) return;
        const blob = await new Promise(res => {
          canvasRef.current.toBlob(b => res(b), file.type || 'image/png', 0.95);
        });
        if (!blob) throw new Error('Could not render canvas to image');

        if (saveMode === 'replace') {
          await replaceFile(file.id, blob, { size: blob.size });
          addToast(`Updated "${file.name}" in vault`, 'success');
          if (logActivity) logActivity('EDIT', `Edited image: ${file.name}`);
        } else {
          const dotIndex = file.name.lastIndexOf('.');
          const base = dotIndex !== -1 ? file.name.substring(0, dotIndex) : file.name;
          const ext = dotIndex !== -1 ? file.name.substring(dotIndex) : '.png';
          const newName = `${base}_edited_${Date.now()}${ext}`;

          await saveFile({
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            name: newName,
            type: file.type || 'image/png',
            size: blob.size,
            category: 'image',
            blob,
            folderId: file.folderId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: ['edited', 'image']
          });
          addToast(`Saved "${newName}" to vault`, 'success');
          if (logActivity) logActivity('SAVE', `Saved edited image: ${newName}`);
        }
      }

      await reloadVault();
      onClose();
    } catch (err) {
      console.error(err);
      addToast('Failed to save media: ' + err.message, 'error');
    } finally {
      setSaving(false);
      setRenderProgress(0);
    }
  };

  if (!isOpen || !file) return null;

  const activeImgW = committedCrop ? committedCrop.sw : (imageObjRef.current?.width || 0);
  const activeImgH = committedCrop ? committedCrop.sh : (imageObjRef.current?.height || 0);
  const previewCropPxW = Math.round((cropBox.w / 100) * activeImgW);
  const previewCropPxH = Math.round((cropBox.h / 100) * activeImgH);

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '94vw',
          maxWidth: '1140px',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)'
        }}
      >
        {/* Top Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontSize: '0.66rem',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--accent-primary)',
              textTransform: 'uppercase'
            }}>
              {isVideo ? 'Video Studio' : 'Image Studio'}
            </span>
            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {file.name}
            </span>
          </div>

          {/* Tab Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-input)',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid var(--border-subtle)'
          }}>
            {isVideo && (
              <button
                className="btn btn-ghost"
                onClick={() => setActiveTab('trim')}
                style={{
                  padding: '3px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '5px',
                  background: activeTab === 'trim' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'trim' ? 'var(--text-primary)' : 'var(--text-muted)',
                  gap: '5px'
                }}
              >
                <Scissors size={12} />
                <span>Trim &amp; Speed</span>
              </button>
            )}

            <button
              className="btn btn-ghost"
              onClick={() => setActiveTab('adjust')}
              style={{
                padding: '3px 10px',
                fontSize: '0.74rem',
                borderRadius: '5px',
                background: activeTab === 'adjust' ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === 'adjust' ? 'var(--text-primary)' : 'var(--text-muted)',
                gap: '5px'
              }}
            >
              <Sliders size={12} />
              <span>Color &amp; Filters</span>
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => setActiveTab('transform')}
              style={{
                padding: '3px 10px',
                fontSize: '0.74rem',
                borderRadius: '5px',
                background: activeTab === 'transform' ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === 'transform' ? 'var(--text-primary)' : 'var(--text-muted)',
                gap: '5px'
              }}
            >
              <RotateCw size={12} />
              <span>Transform</span>
            </button>

            {isImage && (
              <button
                className="btn btn-ghost"
                onClick={() => setActiveTab('crop')}
                style={{
                  padding: '3px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '5px',
                  background: activeTab === 'crop' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'crop' ? 'var(--text-primary)' : 'var(--text-muted)',
                  gap: '5px'
                }}
              >
                <Crop size={12} />
                <span>Crop</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isVideo && (
              <button
                className="btn btn-secondary"
                onClick={handleCaptureVideoFrame}
                style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: '6px', gap: '5px', color: 'var(--accent-emerald)' }}
                title="Save current video frame as PNG to Vault"
              >
                <Camera size={12} />
                <span>Snapshot to Vault</span>
              </button>
            )}

            <button
              className="btn btn-secondary"
              onClick={resetAllAdjustments}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '6px', gap: '4px' }}
              title="Reset all adjustments"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>

            <button
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              style={{ padding: '4px', height: '28px', width: '28px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Studio Workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Controls Bar */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            overflowX: 'auto',
            flexShrink: 0,
            flexWrap: 'wrap'
          }}>
            {activeTab === 'trim' && isVideo && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={toggleVideoPlay}
                  style={{ padding: '5px 12px', fontSize: '0.76rem', borderRadius: '6px', gap: '5px' }}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  <span>{isPlaying ? 'Pause' : 'Play Clip'}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Start:</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, videoDuration)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => {
                      const val = Math.min(Number(e.target.value), Math.max(0, trimEnd - 0.2));
                      setTrimStart(val);
                      if (videoRef.current) videoRef.current.currentTime = val;
                    }}
                    style={{ width: '100px', accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{formatTime(trimStart)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>End:</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, videoDuration)}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => {
                      const val = Math.max(Number(e.target.value), trimStart + 0.2);
                      setTrimEnd(val);
                      if (videoRef.current) videoRef.current.currentTime = val;
                    }}
                    style={{ width: '100px', accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{formatTime(trimEnd)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem' }}>
                  <Gauge size={13} color="var(--text-muted)" />
                  <span style={{ color: 'var(--text-muted)' }}>Speed:</span>
                  {[0.5, 1, 1.25, 1.5, 2].map(spd => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackSpeed(spd)}
                      style={{
                        padding: '3px 7px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: '1px solid var(--border-subtle)',
                        background: playbackSpeed === spd ? 'var(--accent-primary)' : 'var(--bg-input)',
                        color: playbackSpeed === spd ? '#ffffff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVideoMuted(m => !m)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    borderRadius: '6px',
                    gap: '5px',
                    color: videoMuted ? 'var(--accent-rose)' : 'var(--text-secondary)'
                  }}
                >
                  {videoMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  <span>{videoMuted ? 'Muted' : 'Audio On'}</span>
                </button>
              </>
            )}

            {activeTab === 'adjust' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingRight: '8px', borderRight: '1px solid var(--border-subtle)' }}>
                  {FILTER_PRESETS.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '0.72rem',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <ControlSlider label="Brightness" value={brightness} min={50} max={150} unit="%" onChange={setBrightness} />
                <ControlSlider label="Contrast" value={contrast} min={50} max={150} unit="%" onChange={setContrast} />
                <ControlSlider label="Saturation" value={saturate} min={0} max={200} unit="%" onChange={setSaturate} />
                <ControlSlider label="Grayscale" value={grayscale} min={0} max={100} unit="%" onChange={setGrayscale} />
                <ControlSlider label="Sepia" value={sepia} min={0} max={100} unit="%" onChange={setSepia} />
                <ControlSlider label="Blur" value={blur} min={0} max={10} unit="px" onChange={setBlur} />
              </>
            )}

            {activeTab === 'transform' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  style={{ fontSize: '0.76rem', padding: '5px 12px', gap: '6px' }}
                >
                  <RotateCw size={13} /> Rotate 90° ({rotation}°)
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setFlipH(v => !v)}
                  style={{ fontSize: '0.76rem', padding: '5px 12px', gap: '6px', color: flipH ? 'var(--accent-primary)' : 'inherit' }}
                >
                  <FlipHorizontal size={13} /> Flip Horizontal
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setFlipV(v => !v)}
                  style={{ fontSize: '0.76rem', padding: '5px 12px', gap: '6px', color: flipV ? 'var(--accent-primary)' : 'inherit' }}
                >
                  <FlipVertical size={13} /> Flip Vertical
                </button>
              </div>
            )}

            {activeTab === 'crop' && isImage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aspect Ratio:</span>
                {['free', '1:1', '16:9', '4:3'].map(asp => (
                  <button
                    key={asp}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSelectAspect(asp)}
                    style={{
                      fontSize: '0.74rem',
                      padding: '4px 10px',
                      borderRadius: '5px',
                      background: cropAspect === asp ? 'var(--accent-primary)' : 'var(--bg-input)',
                      color: cropAspect === asp ? '#ffffff' : 'var(--text-secondary)'
                    }}
                  >
                    {asp.toUpperCase()}
                  </button>
                ))}

                <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                  Drag box to move, drag corners/edges to resize ({previewCropPxW} &times; {previewCropPxH} px)
                </span>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {committedCrop && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCommittedCrop(null)}
                      style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '5px' }}
                    >
                      Undo Crop
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCommitCrop}
                    style={{ fontSize: '0.75rem', padding: '5px 12px', borderRadius: '6px', gap: '5px' }}
                  >
                    <Check size={13} />
                    <span>Apply Crop</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Borderless Media Viewing Stage */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isVideo ? '0' : '20px',
              background: '#090a0f',
              overflow: 'hidden',
              position: 'relative',
              userSelect: 'none'
            }}
          >
            {isVideo ? (
              mediaUrl ? (
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  controls
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    filter: getFilterCSS(),
                    transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                    transition: 'transform 0.2s ease',
                    border: 'none',
                    outline: 'none',
                    display: 'block'
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Loading video stream...</div>
              )
            ) : (
              /* Tightly Wrapped Canvas + Pixel-Aligned Interactive Drag & Drop Crop Overlay */
              <div
                ref={canvasWrapRef}
                onMouseDown={(e) => activeTab === 'crop' && startCropInteraction(e, 'draw')}
                onTouchStart={(e) => activeTab === 'crop' && startCropInteraction(e, 'draw')}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  cursor: activeTab === 'crop' ? 'crosshair' : 'default'
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 'calc(88vh - 170px)',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                    borderRadius: '4px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)'
                  }}
                />

                {/* Interactive Drag & Drop Crop Box with 8 Resize Handles & Rule-of-Thirds Grid */}
                {activeTab === 'crop' && (
                  <div
                    onMouseDown={(e) => startCropInteraction(e, 'move')}
                    onTouchStart={(e) => startCropInteraction(e, 'move')}
                    style={{
                      position: 'absolute',
                      left: `${cropBox.x}%`,
                      top: `${cropBox.y}%`,
                      width: `${cropBox.w}%`,
                      height: `${cropBox.h}%`,
                      border: '2px solid #ffffff',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58), 0 0 0 1px rgba(99, 102, 241, 0.9)',
                      cursor: 'move',
                      boxSizing: 'border-box',
                      zIndex: 20
                    }}
                  >
                    {/* Rule-of-Thirds Grid Lines */}
                    <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />

                    {/* Live Dimensions Readout Pill */}
                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      left: '6px',
                      background: 'rgba(9, 10, 15, 0.8)',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      pointerEvents: 'none',
                      fontFamily: 'monospace'
                    }}>
                      {previewCropPxW} &times; {previewCropPxH}
                    </div>

                    {/* 8 Resize Handles */}
                    {[
                      { mode: 'nw', style: { top: '-6px', left: '-6px', cursor: 'nwse-resize' } },
                      { mode: 'ne', style: { top: '-6px', right: '-6px', cursor: 'nesw-resize' } },
                      { mode: 'sw', style: { bottom: '-6px', left: '-6px', cursor: 'nesw-resize' } },
                      { mode: 'se', style: { bottom: '-6px', right: '-6px', cursor: 'nwse-resize' } },
                      { mode: 'n', style: { top: '-5px', left: 'calc(50% - 6px)', cursor: 'ns-resize' } },
                      { mode: 's', style: { bottom: '-5px', left: 'calc(50% - 6px)', cursor: 'ns-resize' } },
                      { mode: 'w', style: { left: '-5px', top: 'calc(50% - 6px)', cursor: 'ew-resize' } },
                      { mode: 'e', style: { right: '-5px', top: 'calc(50% - 6px)', cursor: 'ew-resize' } }
                    ].map(h => (
                      <div
                        key={h.mode}
                        onMouseDown={(e) => startCropInteraction(e, h.mode)}
                        onTouchStart={(e) => startCropInteraction(e, h.mode)}
                        style={{
                          position: 'absolute',
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          background: 'var(--accent-primary)',
                          border: '2px solid #ffffff',
                          ...h.style
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Video Render Progress Overlay */}
            {isVideo && saving && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(9, 10, 15, 0.82)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                zIndex: 40
              }}>
                <Loader2 size={32} className="spin" color="var(--accent-primary)" />
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ffffff' }}>
                  Rendering Edited Video Stream... ({renderProgress}%)
                </div>
                <div style={{ width: '260px', height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <div style={{ width: `${renderProgress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.15s ease' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="mediaSaveMode"
                checked={saveMode === 'replace'}
                onChange={() => setSaveMode('replace')}
              />
              <span>Replace in Vault</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="mediaSaveMode"
                checked={saveMode === 'new'}
                onChange={() => setSaveMode('new')}
              />
              <span>{isVideo ? 'Save as New Video' : 'Save as New Image'}</span>
            </label>
            {isVideo && videoDuration > 0 && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Film size={12} />
                <span>Clip: {formatTime(trimStart)} &ndash; {formatTime(trimEnd)} ({Math.max(0, trimEnd - trimStart).toFixed(1)}s)</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleDownload}
              disabled={saving}
              style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px', gap: '5px' }}
            >
              <Download size={13} />
              <span>{isVideo ? 'Export & Download' : 'Download'}</span>
            </button>
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
              style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveToVault}
              disabled={saving}
              style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '6px', gap: '6px' }}
            >
              <Save size={13} />
              <span>{saving ? 'Rendering...' : saveMode === 'replace' ? 'Save Changes' : 'Save to Vault'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlSlider({ label, value, min, max, unit, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, fontSize: '0.74rem' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: '65px' }}>{label}:</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '80px', accentColor: 'var(--accent-primary)' }}
      />
      <span style={{ color: 'var(--text-secondary)', width: '38px', fontVariantNumeric: 'tabular-nums' }}>
        {value}{unit}
      </span>
    </div>
  );
}
