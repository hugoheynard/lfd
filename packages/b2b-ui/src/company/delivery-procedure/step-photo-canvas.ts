import { reduceStepPhoto, type StepPhotoReduction } from './step-photo';

/**
 * L'adaptateur **navigateur** de {@link reduceStepPhoto} : décode le fichier
 * choisi, le peint dans un canvas, l'encode en JPEG.
 *
 * `createImageBitmap` avec `imageOrientation: 'from-image'` : une photo de
 * téléphone porte son orientation en EXIF, et un canvas qui l'ignorerait
 * rendrait une porte couchée sur le flanc.
 */
export async function shrinkStepPhoto(file: Blob): Promise<StepPhotoReduction> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Pas une image que le navigateur sait lire (HEIC sur un bureau, fichier abîmé).
    return { kind: 'unreadable' };
  }
  try {
    return await reduceStepPhoto(bitmap, (frame, quality) => {
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const context = canvas.getContext('2d');
      if (context === null) {
        return Promise.resolve(null);
      }
      context.drawImage(bitmap, 0, 0, frame.width, frame.height);
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    });
  } finally {
    bitmap.close();
  }
}
