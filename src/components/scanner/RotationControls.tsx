import { Button } from '@carbon/react';
import { RotateCounterclockwise, RotateClockwise, Reset } from '@carbon/icons-react';
import './RotationControls.css';

interface RotationControlsProps {
  rotation: number;
  straighten: number;
  onRotate: (degrees: number) => void;
  onStraighten: (degrees: number) => void;
}

/** Rotation buttons (left/right/flip) with rotation badge and fine straighten slider */
export default function RotationControls({ rotation, straighten, onRotate, onStraighten }: RotationControlsProps) {
  const rotateLeft = () => onRotate(((rotation - 90) % 360 + 360) % 360);
  const rotateRight = () => onRotate((rotation + 90) % 360);
  const flip = () => onRotate((rotation + 180) % 360);

  const handleStraightenInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onStraighten(parseFloat(e.target.value));
  };

  const resetStraighten = () => onStraighten(0);

  return (
    <div className="rotation-controls">
      <div className="rotation-buttons">
        <Button kind="ghost" size="sm" renderIcon={RotateCounterclockwise} iconDescription="Rotate left 90°" hasIconOnly onClick={rotateLeft} />
        <Button kind="ghost" size="sm" renderIcon={RotateClockwise} iconDescription="Rotate right 90°" hasIconOnly onClick={rotateRight} />
        <Button kind="ghost" size="sm" renderIcon={Reset} iconDescription="Flip 180°" hasIconOnly onClick={flip} />
        {rotation !== 0 && <span className="rotation-badge">{rotation}°</span>}
      </div>

      <div className="straighten-row">
        <span className="straighten-hint">Straighten</span>
        <input
          type="range"
          className="straighten-slider"
          min={-15}
          max={15}
          step={0.5}
          value={straighten}
          onChange={handleStraightenInput}
          aria-label="Fine straighten angle"
        />
        <span
          className="straighten-label"
          onDoubleClick={resetStraighten}
          aria-label="Straighten angle. Double-click to reset."
        >
          {straighten.toFixed(1)}°
        </span>
      </div>
    </div>
  );
}
