import { reducePhoto, type PhotoReduction, type PhotoReductionPolicy } from './photo-reduction';

/**
 * L'adaptateur **navigateur** de {@link reducePhoto} : décode le fichier
 * choisi, le peint dans un canvas, l'encode en JPEG.
 *
 * `createImageBitmap` avec `imageOrientation: 'from-image'` : une photo de
 * téléphone porte son orientation en EXIF, et un canvas qui l'ignorerait
 * rendrait l'image couchée sur le flanc.
 */
export async function shrinkPhoto(
  file: Blob,
  policy: PhotoReductionPolicy,
): Promise<PhotoReduction> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Pas une image que le navigateur sait lire (HEIC sur un bureau, fichier abîmé).
    return { kind: 'unreadable' };
  }
  try {
    return await reducePhoto(
      bitmap,
      (frame, quality) => {
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext('2d');
        if (context === null) {
          return Promise.resolve(null);
        }
        context.drawImage(bitmap, 0, 0, frame.width, frame.height);
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      },
      policy,
    );
  } finally {
    bitmap.close();
  }
}
