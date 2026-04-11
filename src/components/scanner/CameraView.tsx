import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { Image as ImageIcon, Close, Checkmark, Flash, FlashOff, FlashFilled, Crop } from '@carbon/icons-react';

/** Crop-off icon: crop with a diagonal strike-through */
function CropOffIcon() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M25 23h-2V9H9V7h14a2 2 0 0 1 2 2zM7 9h2v14h14v2H9a2 2 0 0 1-2-2z" />
      <path d="M3.5 4.9 4.9 3.5l23.6 23.6-1.4 1.4z" />
    </svg>
  );
}

/** Camera flip icon: camera outline with two circular arrows inside */
function CameraFlipIcon() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Camera body outline */}
      <path d="M4 11a2 2 0 0 1 2-2h3.5l2-3h9l2 3H26a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V11z" />
      {/* Circular arrows inside */}
      <path d="M19.5 14a4.5 4.5 0 0 0-7.3 1.2" />
      <polyline points="12 13 12 15.5 14.5 15.5" />
      <path d="M12.5 21a4.5 4.5 0 0 0 7.3-1.2" />
      <polyline points="20 22 20 19.5 17.5 19.5" />
    </svg>
  );
}
import { startCamera, stopCamera, captureFrame, checkCameraSupport, triggerHaptic, hasMultipleCameras, setTorch, supportsTorch } from '@/services/camera';
import { detectDocument, stabilizeQuad, resetStabilization } from '@/services/documentDetection';
import type { QuadCrop } from '@/stores/scanner';
import { useScannerStore } from '@/stores/scanner';
import './CameraView.css';

type FlashMode = 'off' | 'on' | 'auto';

interface CameraViewProps {
  onCapture: (blob: Blob, detectedQuad?: QuadCrop | null) => void;
  onClose: () => void;
}

/** Full-viewport camera view with capture, switch, and gallery fallback */
export default function CameraView({ onCapture, onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const doneBtnRef = useRef<HTMLButtonElement>(null);
  const cameraViewRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRafRef = useRef<number>(0);
  const lastQuadRef = useRef<QuadCrop | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [multipleDevices, setMultipleDevices] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [torchSupported, setTorchSupported] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true);
  const cameraFacing = useScannerStore((s) => s.cameraFacing);
  const setCameraFacing = useScannerStore((s) => s.setCameraFacing);
  const pageCount = useScannerStore((s) => s.pages.length);

  const cleanupCamera = useCallback(() => {
    if (streamRef.current) {
      stopCamera(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const initCamera = useCallback(async (facing: 'user' | 'environment') => {
    setErrorMessage(null);
    try {
      const supported = await checkCameraSupport();
      if (!supported) {
        setErrorMessage('Camera not available on this device. Use the gallery button to import images.');
        return;
      }
      const s = await startCamera(facing);
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      // Detect multiple cameras and torch support
      const multi = await hasMultipleCameras();
      setMultipleDevices(multi);
      setTorchSupported(supportsTorch(s));
      setFlashMode('off');
    } catch {
      setErrorMessage('Camera permission denied. Use the gallery button to import images.');
    }
  }, []);

  useEffect(() => {
    initCamera(cameraFacing);
    return () => cleanupCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Real-time document detection overlay ---
  useEffect(() => {
    let running = true;
    let lastDetectTime = 0;
    const DETECT_INTERVAL = 80; // ~12fps detection

    const drawOverlay = (quad: QuadCrop | null) => {
      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      // Match canvas size to video display size
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!quad) return;

      // Map normalized quad to the video's visible area (object-fit: contain)
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      const displayW = rect.width;
      const displayH = rect.height;
      const videoAspect = vw / vh;
      const displayAspect = displayW / displayH;

      let drawW: number, drawH: number, offsetX: number, offsetY: number;
      if (videoAspect > displayAspect) {
        drawW = displayW;
        drawH = displayW / videoAspect;
        offsetX = 0;
        offsetY = (displayH - drawH) / 2;
      } else {
        drawH = displayH;
        drawW = displayH * videoAspect;
        offsetX = (displayW - drawW) / 2;
        offsetY = 0;
      }

      const toScreen = (p: { x: number; y: number }) => ({
        x: offsetX + p.x * drawW,
        y: offsetY + p.y * drawH,
      });

      const tl = toScreen(quad.tl);
      const tr = toScreen(quad.tr);
      const br = toScreen(quad.br);
      const bl = toScreen(quad.bl);

      // Light blue fill
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(100, 180, 255, 0.12)';
      ctx.fill();

      // Light blue border
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    const detectLoop = (time: number) => {
      if (!running) return;

      if (time - lastDetectTime >= DETECT_INTERVAL) {
        lastDetectTime = time;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          const result = detectDocument(video);
          const stable = stabilizeQuad(result.quad);
          lastQuadRef.current = stable;
          drawOverlay(autoCrop ? stable : null);
        }
      }

      detectionRafRef.current = requestAnimationFrame(detectLoop);
    };

    detectionRafRef.current = requestAnimationFrame(detectLoop);

    return () => {
      running = false;
      if (detectionRafRef.current) cancelAnimationFrame(detectionRafRef.current);
    };
  }, [autoCrop]);

  const animateCaptureToButton = useCallback((onComplete: () => void, previewUrl: string) => {
    const container = cameraViewRef.current;
    if (!container) { onComplete(); return; }

    const containerRect = container.getBoundingClientRect();

    // Single element: preview with thick white border that flies to Done
    const preview = document.createElement('img');
    preview.src = previewUrl;
    preview.className = 'capture-preview-card';
    container.appendChild(preview);

    // Phase 1: Show preview briefly (already visible via CSS animation)
    // Phase 2: Shrink and fly to Done button
    setTimeout(() => {
      const doneBtn = doneBtnRef.current;
      if (doneBtn) {
        const freshRect = container.getBoundingClientRect();
        const btnRect = doneBtn.getBoundingClientRect();
        const targetX = btnRect.left - freshRect.left + btnRect.width / 2;
        const targetY = btnRect.top - freshRect.top + btnRect.height / 2;

        preview.style.transition = 'all 550ms cubic-bezier(0.16, 1, 0.3, 1)';
        preview.style.left = `${targetX}px`;
        preview.style.top = `${targetY}px`;
        preview.style.maxWidth = '36px';
        preview.style.maxHeight = '36px';
        preview.style.opacity = '0.3';
        preview.style.borderRadius = '10px';
        preview.style.borderWidth = '2px';
      } else {
        preview.style.transition = 'all 550ms cubic-bezier(0.16, 1, 0.3, 1)';
        preview.style.opacity = '0';
        preview.style.maxWidth = '36px';
        preview.style.maxHeight = '36px';
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        preview.remove();
        onComplete();
        const doneBtn = doneBtnRef.current;
        if (doneBtn) {
          doneBtn.classList.add('done-btn--pulse');
          setTimeout(() => doneBtn.classList.remove('done-btn--pulse'), 500);
        }
      };
      preview.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 800);
    }, 350);
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      // Auto flash: pre-flash then bright flash (mimics native camera behavior)
      const needsAutoFlash = flashMode === 'auto' && streamRef.current && supportsTorch(streamRef.current);
      if (needsAutoFlash) {
        // Pre-flash: brief torch to trigger camera metering
        await setTorch(streamRef.current!, true);
        await new Promise((r) => setTimeout(r, 150));
        await setTorch(streamRef.current!, false);
        await new Promise((r) => setTimeout(r, 100));
        // Main flash: full torch for capture
        await setTorch(streamRef.current!, true);
        await new Promise((r) => setTimeout(r, 400));
      }
      const blob = await captureFrame(videoRef.current);
      if (needsAutoFlash) {
        await setTorch(streamRef.current!, false);
      }
      triggerHaptic();
      const capturedQuad = autoCrop ? lastQuadRef.current : null;

      // Generate preview: cropped if auto-crop, full frame if not
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = videoRef.current.videoWidth;
      rawCanvas.height = videoRef.current.videoHeight;
      const rawCtx = rawCanvas.getContext('2d');
      if (rawCtx) rawCtx.drawImage(videoRef.current, 0, 0);

      let previewUrl: string;
      if (capturedQuad) {
        // Draw just the cropped quad region for preview
        const q = capturedQuad;
        const vw = rawCanvas.width;
        const vh = rawCanvas.height;
        const tl = { x: q.tl.x * vw, y: q.tl.y * vh };
        const tr = { x: q.tr.x * vw, y: q.tr.y * vh };
        const br = { x: q.br.x * vw, y: q.br.y * vh };
        const bl = { x: q.bl.x * vw, y: q.bl.y * vh };
        // Bounding box of the quad
        const minX = Math.max(0, Math.floor(Math.min(tl.x, tr.x, br.x, bl.x)));
        const minY = Math.max(0, Math.floor(Math.min(tl.y, tr.y, br.y, bl.y)));
        const maxX = Math.min(vw, Math.ceil(Math.max(tl.x, tr.x, br.x, bl.x)));
        const maxY = Math.min(vh, Math.ceil(Math.max(tl.y, tr.y, br.y, bl.y)));
        const cropW = maxX - minX;
        const cropH = maxY - minY;
        if (cropW > 0 && cropH > 0) {
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            cropCtx.drawImage(rawCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
          }
          previewUrl = cropCanvas.toDataURL('image/jpeg', 0.5);
        } else {
          previewUrl = rawCanvas.toDataURL('image/jpeg', 0.5);
        }
      } else {
        previewUrl = rawCanvas.toDataURL('image/jpeg', 0.5);
      }

      animateCaptureToButton(() => onCapture(blob, capturedQuad), previewUrl);
    } finally {
      setIsCapturing(false);
    }
  };

  const cycleFlash = useCallback(async () => {
    const next: FlashMode = flashMode === 'off' ? 'on' : flashMode === 'on' ? 'auto' : 'off';
    setFlashMode(next);
    if (streamRef.current) {
      // 'on' = torch always on, 'off'/'auto' = torch off (auto enables at capture time)
      await setTorch(streamRef.current, next === 'on');
    }
  }, [flashMode]);

  const handleSwitchCamera = async () => {
    cleanupCamera();
    resetStabilization();
    lastQuadRef.current = null;
    const newFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(newFacing);
    await initCamera(newFacing);
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      onCapture(file);
    }
  };

  return (
    <div className="camera-view" ref={cameraViewRef}>
      <div className="camera-top-bar">
        <div className="top-bar-left">
          <button className="control-btn" onClick={onClose} aria-label="Close camera">
            <Close size={24} />
          </button>
          {multipleDevices && (
            <button
              className="control-btn"
              onClick={handleSwitchCamera}
              aria-label="Switch camera"
              disabled={!!errorMessage}
            >
              <CameraFlipIcon />
            </button>
          )}
          <button
            className={`control-btn${autoCrop ? ' control-btn--active' : ''}`}
            onClick={() => setAutoCrop((v) => !v)}
            aria-label={autoCrop ? 'Auto-crop on' : 'Auto-crop off'}
          >
            {autoCrop ? <Crop size={24} /> : <CropOffIcon />}
          </button>
        </div>
        <button
          className={`done-btn${pageCount === 0 ? ' done-btn--disabled' : ''}`}
          ref={doneBtnRef}
          onClick={pageCount > 0 ? onClose : undefined}
          aria-label={pageCount > 0 ? 'Done' : 'No pages captured'}
          disabled={pageCount === 0}
        >
          <Checkmark size={20} />
          <span>Done{pageCount > 0 ? ` (${pageCount})` : ''}</span>
        </button>
      </div>

      {errorMessage ? (
        <div className="camera-error">
          <p>{errorMessage}</p>
          <Button kind="secondary" size="sm" onClick={handleGalleryClick}>
            Import from Gallery
          </Button>
        </div>
      ) : (
        <div className="viewfinder-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="viewfinder"
            aria-label="Camera viewfinder"
          />
          <canvas
            ref={overlayRef}
            className="detection-overlay"
            aria-hidden="true"
          />
        </div>
      )}

      <div className="controls-bar">
          {torchSupported ? (
            <button
              className={`control-btn${flashMode !== 'off' ? ' control-btn--active' : ''}`}
              onClick={cycleFlash}
              aria-label={`Flash: ${flashMode}`}
            >
              {flashMode === 'off' && <FlashOff size={24} />}
              {flashMode === 'on' && <FlashFilled size={24} />}
              {flashMode === 'auto' && (
                <>
                  <Flash size={24} />
                  <span className="flash-auto-badge">A</span>
                </>
              )}
            </button>
          ) : (
            <div className="control-btn-placeholder" />
          )}

        <button
          className="capture-btn"
          onClick={handleCapture}
          aria-label="Capture photo"
          disabled={!!errorMessage || isCapturing}
        >
          <span className="capture-circle" />
        </button>

        <button
          className="control-btn"
          onClick={handleGalleryClick}
          aria-label="Import from gallery"
        >
          <ImageIcon size={24} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden-input"
        onChange={handleFileChange}
      />
    </div>
  );
}
