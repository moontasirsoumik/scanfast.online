import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import type { QuadCrop, Point } from '@/stores/scanner';
import './CropEditor.css';

interface CropEditorProps {
  imageUrl: string;
  initialCrop: QuadCrop | null;
  onChange: (crop: QuadCrop) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const CORNER_RADIUS = 10;
const HIT_RADIUS = 24;
const DEFAULT_QUAD: QuadCrop = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } };
type CornerKey = 'tl' | 'tr' | 'br' | 'bl';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Canvas-based 4-corner quadrilateral crop editor with pinch-to-zoom */
export default function CropEditor({ imageUrl, initialCrop, onChange, onConfirm, onCancel }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [scale, setScale] = useState(1.0);
  const imgRectRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const quadRef = useRef<QuadCrop>(initialCrop ? { ...initialCrop, tl: { ...initialCrop.tl }, tr: { ...initialCrop.tr }, br: { ...initialCrop.br }, bl: { ...initialCrop.bl } } : { ...DEFAULT_QUAD });
  const dragRef = useRef<{ corner: CornerKey; } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);

  useEffect(() => {
    if (initialCrop) {
      quadRef.current = { tl: { ...initialCrop.tl }, tr: { ...initialCrop.tr }, br: { ...initialCrop.br }, bl: { ...initialCrop.bl } };
      drawOverlay();
    }
  }, [initialCrop]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateImgRect = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !imgLoaded) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return;

    const s = Math.min(cw / iw, ch / ih);
    const w = iw * s;
    const h = ih * s;
    imgRectRef.current = { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
    drawOverlay();
  }, [imgLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
  };

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
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  // Pinch-to-zoom handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: scale };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      const newScale = clamp(pinchRef.current.startScale * (d / pinchRef.current.startDist), 0.5, 3.0);
      setScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
  };

  const resetScale = useCallback(() => {
    setScale(1.0);
  }, []);

  const handleImgLoad = () => {
    setImgLoaded(true);
    updateImgRect();
  };

  return (
    <div className="crop-editor">
      <div
        className="canvas-container"
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <img
          src={imageUrl}
          alt="Crop target"
          className="crop-image"
          ref={imgRef}
          onLoad={handleImgLoad}
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        />
        <canvas
          ref={canvasRef}
          className="overlay-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      <div className="crop-actions">
        <Button kind="secondary" size="sm" onClick={() => { resetScale(); onCancel(); }}>Cancel</Button>
        <Button kind="primary" size="sm" onClick={() => { resetScale(); onConfirm(); }}>Confirm</Button>
      </div>
    </div>
  );
}
