/** @module Camera service — getUserMedia access, frame capture, and device helpers. */

/** Check if camera (getUserMedia) is available */
export async function checkCameraSupport(): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Check if the device has more than one video input (front + back) */
export async function hasMultipleCameras(): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices.filter((d) => d.kind === 'videoinput').length > 1;
	} catch {
		return false;
	}
}

/** Apply torch (flashlight) mode to the active video track */
export async function setTorch(stream: MediaStream, on: boolean): Promise<boolean> {
	const track = stream.getVideoTracks()[0];
	if (!track) return false;
	try {
		const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
		if (!caps?.torch) return false;
		await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
		return true;
	} catch {
		return false;
	}
}

/** Check if the current stream supports torch */
export function supportsTorch(stream: MediaStream): boolean {
	const track = stream.getVideoTracks()[0];
	if (!track) return false;
	try {
		const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
		return !!caps?.torch;
	} catch {
		return false;
	}
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
