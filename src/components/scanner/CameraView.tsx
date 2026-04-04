import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { SwitchLayer_2 as SwitchLayer, Image as ImageIcon, Close, Checkmark } from '@carbon/icons-react';
import { startCamera, stopCamera, captureFrame, checkCameraSupport, triggerHaptic } from '@/services/camera';
import { useScannerStore } from '@/stores/scanner';
import './CameraView.css';

interface CameraViewProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

/** Full-viewport camera view with capture, switch, and gallery fallback */
export default function CameraView({ onCapture, onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
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
    } catch {
      setErrorMessage('Camera permission denied. Use the gallery button to import images.');
    }
  }, []);

  useEffect(() => {
    initCamera(cameraFacing);
    return () => cleanupCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = async () => {
    if (!videoRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const blob = await captureFrame(videoRef.current);
      triggerHaptic();
      onCapture(blob);
    } finally {
      setIsCapturing(false);
    }
  };

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
    <div className="camera-view">
      <div className="camera-top-bar">
        <button className="control-btn" onClick={onClose} aria-label="Close camera">
          <Close size={24} />
        </button>
        {pageCount > 0 && (
          <button className="done-btn" onClick={onClose} aria-label="Done">
            <Checkmark size={20} />
            <span>Done ({pageCount})</span>
          </button>
        )}
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
        <button
          className="control-btn"
          onClick={handleSwitchCamera}
          aria-label="Switch camera"
          disabled={!!errorMessage}
        >
          <SwitchLayer size={24} />
        </button>

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
