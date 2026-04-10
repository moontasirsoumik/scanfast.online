import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { Image as ImageIcon, Close, Checkmark, Flash, FlashOff, FlashFilled } from '@carbon/icons-react';

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
import { useScannerStore } from '@/stores/scanner';
import './CameraView.css';

type FlashMode = 'off' | 'on' | 'auto';

interface CameraViewProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

/** Full-viewport camera view with capture, switch, and gallery fallback */
export default function CameraView({ onCapture, onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const doneBtnRef = useRef<HTMLButtonElement>(null);
  const cameraViewRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [multipleDevices, setMultipleDevices] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [torchSupported, setTorchSupported] = useState(false);
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

  const animateCaptureToButton = useCallback((onComplete: () => void) => {
    const container = cameraViewRef.current;
    const video = videoRef.current;
    if (!container || !video) { onComplete(); return; }

    // Capture current video frame as a snapshot
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { onComplete(); return; }
    ctx.drawImage(video, 0, 0);

    const snapshot = document.createElement('img');
    snapshot.src = canvas.toDataURL('image/jpeg', 0.6);
    snapshot.className = 'capture-fly-thumb';

    const containerRect = container.getBoundingClientRect();

    // Start: cover entire viewfinder as a square (use shorter dimension)
    const size = Math.max(containerRect.width, containerRect.height);
    snapshot.style.width = `${size}px`;
    snapshot.style.height = `${size}px`;
    snapshot.style.left = `${(containerRect.width - size) / 2}px`;
    snapshot.style.top = `${(containerRect.height - size) / 2}px`;

    container.appendChild(snapshot);

    // Wait for Done button to render (it appears when pageCount increments)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const doneBtn = doneBtnRef.current;
        if (doneBtn) {
          const btnRect = doneBtn.getBoundingClientRect();
          const endX = btnRect.left - containerRect.left + btnRect.width / 2;
          const endY = btnRect.top - containerRect.top + btnRect.height / 2;
          const startCX = containerRect.width / 2;
          const startCY = containerRect.height / 2;

          snapshot.style.transform = `translate(${endX - startCX}px, ${endY - startCY}px) scale(0.04)`;
          snapshot.style.opacity = '0.4';
          snapshot.style.borderRadius = '12px';
        }
      });
    });

    // Cleanup after animation, then update page count
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      snapshot.remove();
      onComplete();
      const doneBtn = doneBtnRef.current;
      if (doneBtn) {
        doneBtn.classList.add('done-btn--pulse');
        setTimeout(() => doneBtn.classList.remove('done-btn--pulse'), 500);
      }
    };
    snapshot.addEventListener('transitionend', cleanup, { once: true });
    // Safety fallback
    setTimeout(cleanup, 1200);
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
      animateCaptureToButton(() => onCapture(blob));
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
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="viewfinder"
          aria-label="Camera viewfinder"
        />
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
