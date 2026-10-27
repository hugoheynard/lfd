import type { QrMatrix } from '@lfd/b2b-ui/order';

import { downloadBlob } from '../download-blob';

/** Pixels par module : assez pour qu'un écran photographié se scanne encore. */
const MODULE_PX = 12;

/**
 * Le QR en PNG, sur fond BLANC — comme à l'écran : un lecteur lit un contraste.
 * `null` si le navigateur ne dessine pas (rendu serveur, canevas refusé).
 */
export async function qrPng(matrix: QrMatrix): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = matrix.dim * MODULE_PX;
  canvas.height = matrix.dim * MODULE_PX;
  const ink = canvas.getContext('2d');
  if (ink === null) {
    return null;
  }
  ink.fillStyle = '#fff';
  ink.fillRect(0, 0, canvas.width, canvas.height);
  ink.fillStyle = '#000';
  for (const { x, y } of matrix.dark) {
    ink.fillRect(x * MODULE_PX, y * MODULE_PX, MODULE_PX, MODULE_PX);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * **Envoyer son QR à qui passera le prendre** (Hugo, 2026-10-27) : la feuille
 * de partage du téléphone, avec l'image — messagerie, e-mail, ce que la
 * personne utilise. Sans partage de fichier (la plupart des bureaux), l'image
 * se télécharge : on l'envoie soi-même. Renoncer au partage n'est pas un échec.
 */
export async function shareQr(matrix: QrMatrix, fileName: string, title: string): Promise<void> {
  const png = await qrPng(matrix);
  if (png === null) {
    return;
  }
  const file = new File([png], fileName, { type: 'image/png' });
  const shared = { files: [file], title };
  if (typeof navigator.canShare === 'function' && navigator.canShare(shared)) {
    try {
      await navigator.share(shared);
    } catch {
      // Feuille refermée sans envoyer : rien à dire.
    }
    return;
  }
  downloadBlob(fileName, png);
}
