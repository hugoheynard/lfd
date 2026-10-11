import { InjectionToken } from '@angular/core';
import type { ImagePalette } from '@lfd/pim-contracts';

import { extractPalette } from '../rules/palette-extract';

/** Le côté de la miniature lue par le canvas : assez pour les couleurs, peu pour le calcul. */
export const SAMPLE_SIDE = 64;

/**
 * La palette d'une image du navigateur — un fichier choisi, ou une adresse.
 *
 * Miniature de {@link SAMPLE_SIDE} px sur un canvas, puis {@link extractPalette}.
 * 🔴 Rend `null` sur TOUT échec — décodeur absent, image illisible, canvas
 * « contaminé » par une adresse servie sans CORS : la palette est cosmétique,
 * elle ne bloque jamais un dépôt ni un affichage.
 */
export async function readPalette(source: Blob | string): Promise<ImagePalette | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    const image = typeof source === 'string' ? await loadUrl(source) : await loadBlob(source);
    if (image === null) {
      return null;
    }
    const scale = SAMPLE_SIDE / Math.max(image.width, image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return null;
    }
    context.drawImage(image.drawable, 0, 0, width, height);
    // Lève une SecurityError si l'adresse n'a pas autorisé la lecture (CORS).
    return extractPalette(context.getImageData(0, 0, width, height).data);
  } catch {
    return null;
  }
}

interface Decoded {
  readonly drawable: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

async function loadBlob(blob: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }
  const bitmap = await createImageBitmap(blob);
  return { drawable: bitmap, width: bitmap.width, height: bitmap.height };
}

async function loadUrl(url: string): Promise<Decoded | null> {
  if (typeof Image !== 'function') {
    return null;
  }
  const image = new Image();
  // Anonyme : le stockage sert les images avec CORS ; sans lui, le canvas
  // serait contaminé et `getImageData` lèverait.
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return { drawable: image, width: image.naturalWidth, height: image.naturalHeight };
}

/** Ce qui lit la palette d'une image — remplacé en test, où il n'y a pas de canvas. */
export type PaletteReader = (source: Blob | string) => Promise<ImagePalette | null>;

/** Le lecteur de palette ; le canvas du navigateur par défaut. */
export const PALETTE_READER = new InjectionToken<PaletteReader>('PALETTE_READER', {
  providedIn: 'root',
  factory: () => readPalette,
});
