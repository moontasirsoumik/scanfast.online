import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { Maximize, Minimize, Crop, ReflectHorizontal, ReflectVertical, Rotate, RotateCounterclockwise, RotateClockwise, WatsonHealthAngle, Undo, Redo, Reset } from '@carbon/icons-react';
import type { QuadCrop, Point } from '@/stores/scanner';
import { detectDocumentFromBlob } from '@/services/documentDetection';
import './CropEditor.css';
import '../scanner/AdjustmentBar.css';

type CropTool = 'straighten' | 'perspectiveH' | 'perspectiveV';

interface CropEditorProps {
  imageUrl: string;
  initialCrop: QuadCrop | null;
  rotation: number;
  straighten: number;
  flipH: boolean;
  flipV: boolean;
  perspectiveH: number;
  perspectiveV: number;
  canUndo?: boolean;
  canRedo?: boolean;
  canReset?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onReset?: () => void;
  onRotate: (degrees: number) => void;
  onStraightenChange: (v: number) => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onPerspectiveHChange: (v: number) => void;
  onPerspectiveVChange: (v: number) => void;
  onChange: (crop: QuadCrop) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const CORNER_RADIUS = 10;
const HIT_RADIUS = 24;
const DEFAULT_QUAD: QuadCrop = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } };
const FOCUS_MODE_CLASS = 'sf-crop-focus-mode';
type CornerKey = 'tl' | 'tr' | 'br' | 'bl';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Canvas-based 4-corner quadrilateral crop editor with pinch-to-zoom */
export default function CropEditor({ imageUrl, initialCrop, rotation, straighten, flipH, flipV, perspectiveH, perspectiveV, canUndo, canRedo, canReset, onUndo, onRedo, onReset, onRotate, onStraightenChange, onFlipH, onFlipV, onPerspectiveHChange, onPerspectiveVChange, onChange, onConfirm, onCancel }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeContainerRef = useRef<HTMLDivElement>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const cropTabsRef = useRef<HTMLDivElement>(null);

  const handleCropTabsWheel = useCallback((e: React.WheelEvent) => {
    const el = cropTabsRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (e.deltaY !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [loupeVisible, setLoupeVisible] = useState(false);
  const [loupeStyle, setLoupeStyle] = useState<React.CSSProperties>({});
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const animFrameRef = useRef<number>(0);
  const imgRectRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const quadRef = useRef<QuadCrop>(initialCrop ? { ...initialCrop, tl: { ...initialCrop.tl }, tr: { ...initialCrop.tr }, br: { ...initialCrop.br }, bl: { ...initialCrop.bl } } : { ...DEFAULT_QUAD });
  const dragRef = useRef<{ corner: CornerKey; } | null>(null);
  const loupeLockedRef = useRef(false);

  useEffect(() => {
    if (initialCrop) {
      quadRef.current = { tl: { ...initialCrop.tl }, tr: { ...initialCrop.tr }, br: { ...initialCrop.br }, bl: { ...initialCrop.bl } };
      drawOverlay();
    }
  }, [initialCrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load source image for loupe pixel access
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => { sourceImgRef.current = img; };
    return () => { sourceImgRef.current = null; };
  }, [imageUrl]);

  const updateImgRect = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !imgLoaded) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return;

    // Inset so corner handles (radius 10px) are never clipped at edges
    const PAD = CORNER_RADIUS + 4; // 14px — must match CSS .crop-image inset
    const availW = Math.max(cw - PAD * 2, 1);
    const availH = Math.max(ch - PAD * 2, 1);
    const s = Math.min(availW / iw, availH / ih);
    const w = iw * s;
    const h = ih * s;
    imgRectRef.current = { x: PAD + (availW - w) / 2, y: PAD + (availH - h) / 2, w, h };
    drawOverlay();
  }, [imgLoaded, isFocusMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Convert normalized quad point to canvas pixel coords */
  const toCanvas = useCallback((p: Point): { cx: number; cy: number } => {
    const ir = imgRectRef.current;
    return { cx: ir.x + p.x * ir.w, cy: ir.y + p.y * ir.h };
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const q = quadRef.current;
    const tl = toCanvas(q.tl);
    const tr = toCanvas(q.tr);
    const br = toCanvas(q.br);
    const bl = toCanvas(q.bl);

    // Step 1: Fill entire canvas with dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, cw, ch);

    // Step 2: Cut out the quad shape
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(tl.cx, tl.cy);
    ctx.lineTo(tr.cx, tr.cy);
    ctx.lineTo(br.cx, br.cy);
    ctx.lineTo(bl.cx, bl.cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fill();
    ctx.restore();

    // Step 3: Draw quad outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tl.cx, tl.cy);
    ctx.lineTo(tr.cx, tr.cy);
    ctx.lineTo(br.cx, br.cy);
    ctx.lineTo(bl.cx, bl.cy);
    ctx.closePath();
    ctx.stroke();

    // Step 4: Draw corner circles
    const corners = [tl, tr, br, bl];
    for (const c of corners) {
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, CORNER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0f62fe';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Step 5: Draw edge midpoint dots (visual guide only)
    const midpoints = [
      { mx: (tl.cx + tr.cx) / 2, my: (tl.cy + tr.cy) / 2 },
      { mx: (tr.cx + br.cx) / 2, my: (tr.cy + br.cy) / 2 },
      { mx: (br.cx + bl.cx) / 2, my: (br.cy + bl.cy) / 2 },
      { mx: (bl.cx + tl.cx) / 2, my: (bl.cy + tl.cy) / 2 },
    ];
    for (const m of midpoints) {
      ctx.beginPath();
      ctx.arc(m.mx, m.my, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
    }
  }, [toCanvas]);

  // ResizeObserver
  useEffect(() => {
    if (!imgLoaded || !containerRef.current) return;
    updateImgRect();
    const ro = new ResizeObserver(() => updateImgRect());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [imgLoaded, updateImgRect]);

  function findClosestCorner(px: number, py: number): CornerKey | null {
    const q = quadRef.current;
    const keys: CornerKey[] = ['tl', 'tr', 'br', 'bl'];
    let closest: CornerKey | null = null;
    let minDist = HIT_RADIUS;

    for (const key of keys) {
      const { cx, cy } = toCanvas(q[key]);
      const d = dist(px, py, cx, cy);
      if (d < minDist) {
        minDist = d;
        closest = key;
      }
    }
    return closest;
  }

  function pointerCoords(e: React.PointerEvent): { px: number; py: number } {
    if (!containerRef.current) return { px: 0, py: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    const { px, py } = pointerCoords(e);
    const corner = findClosestCorner(px, py);
    if (!corner) return;
    dragRef.current = { corner };
    (e.target as Element)?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    loupeLockedRef.current = false;
    setLoupeVisible(true);
    updateLoupe(px, py);
  };

  /** Draw the magnified area around (px, py) into the loupe canvas */
  const updateLoupe = useCallback((px: number, py: number) => {
    const loupeCanvas = loupeCanvasRef.current;
    const srcImg = sourceImgRef.current;
    const container = containerRef.current;
    if (!loupeCanvas || !srcImg || !container) return;

    const LOUPE_CSS = 60;   // must match CSS width/height
    const ZOOM = 2.5;
    const OFFSET = 58;
    const DPR = Math.min(window.devicePixelRatio ?? 1, 3);

    // Hi-DPI canvas — crisp on retina
    loupeCanvas.width = LOUPE_CSS * DPR;
    loupeCanvas.height = LOUPE_CSS * DPR;
    const ctx = loupeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(DPR, DPR);

    // Lock position on first call per drag — stays fixed for entire gesture
    if (!loupeLockedRef.current) {
      loupeLockedRef.current = true;
      const cw = container.clientWidth;
      const ch = container.clientHeight;

      // Priority: above-right → above-left → side. Never below the touch point.
      let lx = px + OFFSET;
      let ly = py - OFFSET - LOUPE_CSS / 2;

      if (lx + LOUPE_CSS > cw - 8) lx = px - OFFSET - LOUPE_CSS;
      if (lx < 8) lx = 8;
      if (ly < 8) ly = 8;
      if (ly + LOUPE_CSS > py - 20) {
        ly = Math.max(8, py - OFFSET - LOUPE_CSS);
        if (ly + LOUPE_CSS > py - 10) {
          ly = Math.max(8, Math.min(py - LOUPE_CSS / 2, ch - LOUPE_CSS - 8));
          lx = px < cw / 2
            ? Math.min(px + OFFSET, cw - LOUPE_CSS - 8)
            : Math.max(px - OFFSET - LOUPE_CSS, 8);
        }
      }

      setLoupeStyle({ left: `${lx}px`, top: `${ly}px` });
    }

    // Map pointer → source image coords
    const ir = imgRectRef.current;
    const srcX = ((px - ir.x) / ir.w) * srcImg.naturalWidth;
    const srcY = ((py - ir.y) / ir.h) * srcImg.naturalHeight;
    const regionW = (LOUPE_CSS / ZOOM) * (srcImg.naturalWidth / ir.w);
    const regionH = (LOUPE_CSS / ZOOM) * (srcImg.naturalHeight / ir.h);

    // Circular clip — fill dark bg first so edge-of-image regions stay clean
    ctx.save();
    ctx.beginPath();
    ctx.arc(LOUPE_CSS / 2, LOUPE_CSS / 2, LOUPE_CSS / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0d0d0d';
    ctx.fill();
    ctx.drawImage(srcImg, srcX - regionW / 2, srcY - regionH / 2, regionW, regionH, 0, 0, LOUPE_CSS, LOUPE_CSS);
    ctx.restore();

    // Clean + crosshair — medium arms, no center dot
    const c = LOUPE_CSS / 2;
    const ARM = 12;
    const crossPaths: [number, number, number, number][] = [
      [c - ARM, c, c + ARM, c],
      [c, c - ARM, c, c + ARM],
    ];
    ctx.lineCap = 'round';
    // Dark shadow pass
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2.5;
    for (const [x1, y1, x2, y2] of crossPaths) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // White foreground pass
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    for (const [x1, y1, x2, y2] of crossPaths) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const { px, py } = pointerCoords(e);
    const ir = imgRectRef.current;
    if (ir.w === 0 || ir.h === 0) return;

    const nx = clamp((px - ir.x) / ir.w, 0, 1);
    const ny = clamp((py - ir.y) / ir.h, 0, 1);

    quadRef.current = {
      ...quadRef.current,
      [drag.corner]: { x: nx, y: ny }
    };
    drawOverlay();
    onChange({ ...quadRef.current });
    updateLoupe(px, py);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setLoupeVisible(false);
  };

  const handleImgLoad = () => {
    setImgLoaded(true);
    updateImgRect();
  };

  /** Animate quad corners from current position to target over ~300ms */
  const animateQuadTo = useCallback((target: QuadCrop) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const start = {
      tl: { ...quadRef.current.tl },
      tr: { ...quadRef.current.tr },
      br: { ...quadRef.current.br },
      bl: { ...quadRef.current.bl },
    };
    const duration = 300;
    const t0 = performance.now();

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      const elapsed = now - t0;
      const raw = Math.min(1, elapsed / duration);
      const t = ease(raw);

      quadRef.current = {
        tl: { x: lerp(start.tl.x, target.tl.x, t), y: lerp(start.tl.y, target.tl.y, t) },
        tr: { x: lerp(start.tr.x, target.tr.x, t), y: lerp(start.tr.y, target.tr.y, t) },
        br: { x: lerp(start.br.x, target.br.x, t), y: lerp(start.br.y, target.br.y, t) },
        bl: { x: lerp(start.bl.x, target.bl.x, t), y: lerp(start.bl.y, target.bl.y, t) },
      };
      drawOverlay();

      if (raw < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = 0;
        onChange({ ...quadRef.current });
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, [drawOverlay, onChange]);

  const handleAutoCrop = useCallback(async () => {
    if (isDetecting) return;
    setIsDetecting(true);
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const detected = await detectDocumentFromBlob(blob);
      if (detected) {
        animateQuadTo(detected);
      }
    } catch {
      // silently fail
    } finally {
      setIsDetecting(false);
    }
  }, [imageUrl, isDetecting, animateQuadTo]);

  const blurTarget = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).blur();
  };

  const toggleFocusMode = (e: React.MouseEvent) => {
    blurTarget(e);
    setIsFocusMode((prev) => !prev);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    blurTarget(e);
    setIsFocusMode(false);
    onConfirm();
  };

  const handleCancel = (e: React.MouseEvent) => {
    blurTarget(e);
    setIsFocusMode(false);
    onCancel();
  };

  useEffect(() => {
    document.documentElement.classList.toggle(FOCUS_MODE_CLASS, isFocusMode);
    document.body.classList.toggle(FOCUS_MODE_CLASS, isFocusMode);
    const inertTargets = Array.from(document.querySelectorAll('.cds--header, .preview-bottom-panel, .sf-preview-header, .sf-preview-nav-button'));
    for (const element of inertTargets) {
      if (isFocusMode) {
        element.setAttribute('inert', '');
      } else {
        element.removeAttribute('inert');
      }
    }
    const timeoutId = window.setTimeout(() => updateImgRect(), 180);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isFocusMode, updateImgRect]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      document.documentElement.classList.remove(FOCUS_MODE_CLASS);
      document.body.classList.remove(FOCUS_MODE_CLASS);
      for (const element of Array.from(document.querySelectorAll('.cds--header, .preview-bottom-panel, .sf-preview-header, .sf-preview-nav-button'))) {
        element.removeAttribute('inert');
      }
    };
  }, []);

  const [activeTool, setActiveTool] = useState<CropTool>('straighten');

  const toolSliderValue = activeTool === 'straighten' ? straighten
    : activeTool === 'perspectiveH' ? perspectiveH
    : perspectiveV;

  const toolSliderRange = activeTool === 'straighten'
    ? { min: -15, max: 15, step: 0.5 }
    : { min: -50, max: 50, step: 1 };

  const toolSliderLabel = activeTool === 'straighten' ? `${straighten.toFixed(1)}°`
    : activeTool === 'perspectiveH' ? `${perspectiveH}`
    : `${perspectiveV}`;

  const handleToolSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (activeTool === 'straighten') onStraightenChange(v);
    else if (activeTool === 'perspectiveH') onPerspectiveHChange(v);
    else if (activeTool === 'perspectiveV') onPerspectiveVChange(v);
  };

  const resetToolSlider = () => {
    if (activeTool === 'straighten') onStraightenChange(0);
    else if (activeTool === 'perspectiveH') onPerspectiveHChange(0);
    else if (activeTool === 'perspectiveV') onPerspectiveVChange(0);
  };

  const selectTool = (tool: CropTool) => {
    setActiveTool(tool);
  };

  return (
    <div className={`crop-editor${isFocusMode ? ' crop-editor--focus-mode' : ''}`}>
      <div className="canvas-container" ref={containerRef}>
        <img
          src={imageUrl}
          alt="Crop target"
          className="crop-image"
          ref={imgRef}
          onLoad={handleImgLoad}
        />
        <canvas
          ref={canvasRef}
          className="overlay-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {loupeVisible && (
          <div
            ref={loupeContainerRef}
            className="crop-loupe"
            style={loupeStyle}
          >
            <canvas ref={loupeCanvasRef} width={60} height={60} />
          </div>
        )}
        <div className="crop-focus-controls">
          {onUndo && (
            <Button
              className="crop-focus-toggle"
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Undo}
              iconDescription="Undo"
              tooltipPosition="left"
              disabled={!canUndo}
              onClick={onUndo}
            />
          )}
          {onRedo && (
            <Button
              className="crop-focus-toggle"
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Redo}
              iconDescription="Redo"
              tooltipPosition="left"
              disabled={!canRedo}
              onClick={onRedo}
            />
          )}
          {onReset && (
            <Button
              className="crop-focus-toggle"
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Reset}
              iconDescription="Reset all edits"
              tooltipPosition="left"
              disabled={!canReset}
              onClick={onReset}
            />
          )}
          <Button
            className="crop-focus-toggle"
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Crop}
            iconDescription="Auto-detect edges"
            tooltipPosition="left"
            onClick={handleAutoCrop}
            disabled={isDetecting}
          />
          <Button
            className="crop-focus-toggle"
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={isFocusMode ? Minimize : Maximize}
            iconDescription={isFocusMode ? 'Restore crop view' : 'Maximize crop view'}
            tooltipPosition="left"
            onClick={toggleFocusMode}
          />
        </div>
      </div>

      {/* --- Adjustment tools --- */}
      {!isFocusMode && (
      <div className="adjustment-bar">
          <div className="adj-slider-row">
            <input
              type="range"
              className="adj-slider"
              min={toolSliderRange.min}
              max={toolSliderRange.max}
              step={toolSliderRange.step}
              value={toolSliderValue}
              onChange={handleToolSlider}
              aria-label={activeTool}
            />
            <span className="adj-slider-label" onDoubleClick={resetToolSlider}>{toolSliderLabel}</span>
          </div>
        <div className="adj-tabs" ref={cropTabsRef} onWheel={handleCropTabsWheel}>
          <button
            className="adj-tab"
            onClick={() => onRotate(((rotation - 90) % 360 + 360) % 360)}
            aria-label="Rotate left"
            title="Rotate left"
          >
            <RotateCounterclockwise size={18} />
            <span>Rotate L</span>
          </button>
          <button
            className="adj-tab"
            onClick={() => onRotate((rotation + 90) % 360)}
            aria-label="Rotate right"
            title="Rotate right"
          >
            <RotateClockwise size={18} />
            <span>Rotate R</span>
          </button>
          <button
            className={`adj-tab${activeTool === 'straighten' ? ' active' : ''}${straighten !== 0 ? ' modified' : ''}`}
            onClick={() => selectTool('straighten')}
            aria-label="Straighten"
            title="Straighten"
          >
            <Rotate size={18} />
            <span>Straighten</span>
          </button>
          <button
            className={`adj-tab${flipH ? ' active' : ''}`}
            onClick={onFlipH}
            aria-label="Flip horizontal"
            title="Flip horizontal"
          >
            <ReflectHorizontal size={18} />
            <span>Flip H</span>
          </button>
          <button
            className={`adj-tab${flipV ? ' active' : ''}`}
            onClick={onFlipV}
            aria-label="Flip vertical"
            title="Flip vertical"
          >
            <ReflectVertical size={18} />
            <span>Flip V</span>
          </button>
          <button
            className={`adj-tab${activeTool === 'perspectiveH' ? ' active' : ''}${perspectiveH !== 0 ? ' modified' : ''}`}
            onClick={() => selectTool('perspectiveH')}
            aria-label="Perspective horizontal"
            title="Perspective horizontal"
          >
            <WatsonHealthAngle size={18} />
            <span>Persp. H</span>
          </button>
          <button
            className={`adj-tab${activeTool === 'perspectiveV' ? ' active' : ''}${perspectiveV !== 0 ? ' modified' : ''}`}
            onClick={() => selectTool('perspectiveV')}
            aria-label="Perspective vertical"
            title="Perspective vertical"
          >
            <WatsonHealthAngle size={18} style={{ transform: 'rotate(90deg)' }} />
            <span>Persp. V</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
