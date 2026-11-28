import { readQrCode, scannerAvailable } from './qr-reader';

/** Lit l'image courante d'une vidéo : le contenu d'un QR, ou `null`. */
export type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>;

/** Largeur à laquelle jsQR décode : assez pour un QR à bout de bras, pas plus. */
const DECODE_WIDTH = 640;

/** La caméra arrière s'ouvre : seul `getUserMedia` est exigé. */
export function cameraAvailable(): boolean {
  return typeof navigator?.mediaDevices?.getUserMedia === 'function';
}

/**
 * **Le décodeur de QR de cet appareil** : `BarcodeDetector` quand le
 * navigateur l'a (Chrome, Edge), sinon **jsQR**, un décodeur en JavaScript
 * pur — Safari, sur iPhone comme sur iPad, et Firefox n'ont pas l'API native.
 *
 * 🔴 jsQR est importé **dynamiquement, ici et seulement ici**, au premier
 * allumage de la caméra sur un navigateur sans API native : jamais dans le
 * paquet de démarrage. Un poste Chrome ne le télécharge jamais.
 */
export async function frameDecoder(): Promise<FrameDecoder> {
  if (scannerAvailable()) {
    return readQrCode;
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (video) => {
    const { videoWidth, videoHeight } = video;
    if (context === null || videoWidth === 0 || videoHeight === 0) {
      return Promise.resolve(null);
    }
    const scale = Math.min(1, DECODE_WIDTH / videoWidth);
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'dontInvert',
    });
    return Promise.resolve(code?.data ?? null);
  };
}
