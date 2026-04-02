/** @module Camera service — getUserMedia access, frame capture, and device helpers. */

/** Check if camera (getUserMedia) is available */
export async function checkCameraSupport(): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Start camera stream with given facing mode */
export async function startCamera(facing: 'user' | 'environment'): Promise<MediaStream> {
	if (typeof window === 'undefined') {
		throw new Error('Camera is only available in the browser');
	}

	const constraints: MediaStreamConstraints = {
		video: {
			facingMode: facing,
			width: { ideal: 1920, min: 640 },
			height: { ideal: 1080, min: 480 }
		},
		audio: false
	};

	return navigator.mediaDevices.getUserMedia(constraints);
}

/** Stop all tracks on a media stream */
export function stopCamera(stream: MediaStream): void {
	for (const track of stream.getTracks()) {
		track.stop();
	}
}

/** Capture the current video frame as a JPEG Blob */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Failed to get canvas 2d context');

	ctx.drawImage(video, 0, 0);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error('Failed to capture frame as blob'));
			},
			'image/jpeg',
			0.92
		);
	});
}

/** Trigger a short haptic pulse (50ms), guarded for unsupported browsers */
export function triggerHaptic(): void {
	if (typeof window === 'undefined') return;
	if ('vibrate' in navigator) {
		navigator.vibrate(50);
	}
}
