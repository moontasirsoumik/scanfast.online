import { Button } from '@carbon/react';
import { RotateCounterclockwise, RotateClockwise, Reset } from '@carbon/icons-react';
import './RotationControls.css';

interface RotationControlsProps {
  rotation: number;
  onRotate: (degrees: number) => void;
}

/** Rotation buttons (left/right/flip) with rotation badge */
export default function RotationControls({ rotation, onRotate }: RotationControlsProps) {
  const rotateLeft = () => onRotate(((rotation - 90) % 360 + 360) % 360);
  const rotateRight = () => onRotate((rotation + 90) % 360);
  const flip = () => onRotate((rotation + 180) % 360);

  return (
    <div className="rotation-controls">
      <div className="rotation-buttons">
        <Button kind="ghost" size="sm" renderIcon={RotateCounterclockwise} iconDescription="Rotate left 90°" hasIconOnly onClick={rotateLeft} />
        <Button kind="ghost" size="sm" renderIcon={RotateClockwise} iconDescription="Rotate right 90°" hasIconOnly onClick={rotateRight} />
        <Button kind="ghost" size="sm" renderIcon={Reset} iconDescription="Flip 180°" hasIconOnly onClick={flip} />
        {rotation !== 0 && <span className="rotation-badge">{rotation}°</span>}
      </div>
    </div>
  );
}
