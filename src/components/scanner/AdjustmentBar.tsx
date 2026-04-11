import { useState, useEffect, useRef, useCallback } from 'react';
import { BrightnessContrast, Contrast, Light, ColorPalette, Clean, Temperature, DropPhoto, Sun, CircleSolid } from '@carbon/icons-react';
import './AdjustmentBar.css';

type AdjustmentKey = 'filterIntensity' | 'brightness' | 'contrast' | 'shadows' | 'sharpness' | 'warmth' | 'saturation' | 'highlights' | 'vignette';

interface AdjustmentBarProps {
  activeFilter: string;
  filterIntensity: number;
  brightness: number;
  contrast: number;
  shadows: number;
  sharpness: number;
  warmth: number;
  saturation: number;
  highlights: number;
  vignette: number;
  onFilterIntensityChange: (v: number) => void;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onShadowsChange: (v: number) => void;
  onSharpnessChange: (v: number) => void;
  onWarmthChange: (v: number) => void;
  onSaturationChange: (v: number) => void;
  onHighlightsChange: (v: number) => void;
  onVignetteChange: (v: number) => void;
}

const ADJUSTMENTS: { key: AdjustmentKey; label: string; icon: typeof BrightnessContrast; min: number; max: number; step: number; defaultVal: number }[] = [
  { key: 'filterIntensity', label: 'Intensity', icon: ColorPalette, min: 0, max: 100, step: 1, defaultVal: 100 },
  { key: 'brightness', label: 'Brightness', icon: BrightnessContrast, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'contrast', label: 'Contrast', icon: Contrast, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'shadows', label: 'Shadows', icon: Light, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'sharpness', label: 'Sharpness', icon: Clean, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'warmth', label: 'Warmth', icon: Temperature, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'saturation', label: 'Saturation', icon: DropPhoto, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'highlights', label: 'Highlights', icon: Sun, min: -100, max: 100, step: 1, defaultVal: 0 },
  { key: 'vignette', label: 'Vignette', icon: CircleSolid, min: 0, max: 100, step: 1, defaultVal: 0 },
];

/** Adjustment bar with tool tabs + slider for filter/image adjustments */
export default function AdjustmentBar({
  activeFilter, filterIntensity, brightness, contrast, shadows,
  sharpness, warmth, saturation, highlights, vignette,
  onFilterIntensityChange, onBrightnessChange, onContrastChange, onShadowsChange,
  onSharpnessChange, onWarmthChange, onSaturationChange, onHighlightsChange, onVignetteChange
}: AdjustmentBarProps) {
  const intensityDisabled = activeFilter === 'original';
  const [activeKey, setActiveKey] = useState<AdjustmentKey>(intensityDisabled ? 'brightness' : 'filterIntensity');

  // Switch away from intensity if filter changes to original
  useEffect(() => {
    if (intensityDisabled && activeKey === 'filterIntensity') {
      setActiveKey('brightness');
    }
  }, [intensityDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const values: Record<AdjustmentKey, number> = { filterIntensity, brightness, contrast, shadows, sharpness, warmth, saturation, highlights, vignette };
  const setters: Record<AdjustmentKey, (v: number) => void> = {
    filterIntensity: onFilterIntensityChange,
    brightness: onBrightnessChange,
    contrast: onContrastChange,
    shadows: onShadowsChange,
    sharpness: onSharpnessChange,
    warmth: onWarmthChange,
    saturation: onSaturationChange,
    highlights: onHighlightsChange,
    vignette: onVignetteChange,
  };

  const active = ADJUSTMENTS.find((a) => a.key === activeKey)!;

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeKey === 'filterIntensity' && intensityDisabled) return;
    setters[activeKey](parseFloat(e.target.value));
  };

  const handleReset = () => {
    if (activeKey === 'filterIntensity' && intensityDisabled) return;
    setters[activeKey](active.defaultVal);
  };

  const handleSelectKey = (key: AdjustmentKey) => {
    if (key === 'filterIntensity' && intensityDisabled) return;
    setActiveKey(key);
  };

  const formatValue = (key: AdjustmentKey, val: number): string => {
    if (key === 'filterIntensity') return `${val}%`;
    return val > 0 ? `+${val}` : `${val}`;
  };

  const tabsRef = useRef<HTMLDivElement>(null);
  const handleTabsWheel = useCallback((e: React.WheelEvent) => {
    const el = tabsRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (e.deltaY !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <div className="adjustment-bar">
      <div className="adj-slider-row">
        <input
          type="range"
          className="adj-slider"
          min={active.min}
          max={active.max}
          step={active.step}
          value={values[activeKey]}
          onChange={handleSlider}
          aria-label={active.label}
        />
        <span className="adj-slider-label" onDoubleClick={handleReset}>
          {formatValue(activeKey, values[activeKey])}
        </span>
      </div>
      <div className="adj-tabs" ref={tabsRef} onWheel={handleTabsWheel}>
        {ADJUSTMENTS.map((a) => {
          const Icon = a.icon;
          const isActive = activeKey === a.key;
          const isModified = values[a.key] !== a.defaultVal;
          const isDisabled = a.key === 'filterIntensity' && intensityDisabled;
          return (
            <button
              key={a.key}
              className={`adj-tab${isActive ? ' active' : ''}${isModified ? ' modified' : ''}${isDisabled ? ' disabled' : ''}`}
              onClick={() => handleSelectKey(a.key)}
              aria-label={a.label}
              title={a.label}
              disabled={isDisabled}
            >
              <Icon size={18} />
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
