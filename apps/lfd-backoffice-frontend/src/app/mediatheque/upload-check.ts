import { InjectionToken } from '@angular/core';
import { MEDIA_LIMITS } from '@lfd/pim-contracts';

/** Ce que le navigateur a pu lire des dimensions d'un fichier. `null` : il n'a pas su. */
export interface MeasuredSize {
  readonly width: number;
  readonly height: number;
}

/** Mesure une image dans le navigateur. Injectée, pour qu'un test la simule. */
export type ImageMeasure = (file: File) => Promise<MeasuredSize | null>;

/**
 * La mesure par défaut : `createImageBitmap` décode l'image sans la poser
 * dans le document. Un échec rend `null`, jamais un refus — voir
 * {@link checkBeforeUpload}.
 */
export const IMAGE_MEASURE = new InjectionToken<ImageMeasure>('IMAGE_MEASURE', {
  providedIn: 'root',
  factory: () => async (file) => {
    if (typeof createImageBitmap !== 'function') {
      return null;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      return null;
    }
  },
});

const ACCEPTED: readonly string[] = MEDIA_LIMITS.acceptedTypes;

/** Les mégaoctets tels que le serveur les écrit : une décimale, virgule française. */
function megabytes(count: number): string {
  return (count / (1024 * 1024)).toFixed(1).replace('.', ',');
}

/**
 * **Vérifier avant d'envoyer** (plan L3, point 1) — rend le refus que le
 * serveur aurait donné, ou `null`.
 *
 * 🔴 Les phrases sont CELLES du serveur (`image-bytes.ts`, relu le
 * 2026-10-10), dans le même ordre : vide, poids, format, dimensions. Un
 * fichier refusé ici aurait été refusé là-bas pour la même raison ; le
 * compte rendu ne doit pas dire deux choses selon qui a refusé.
 *
 * ⚠️ Le serveur reste l'AUTORITÉ, et c'est pourquoi le doute laisse passer :
 * - le type lu ici est celui qu'annonce le navigateur (l'extension), là où le
 *   serveur renifle les octets — un PNG renommé `.jpg` passe ici et s'y fait
 *   juger ;
 * - des dimensions que le navigateur ne sait pas lire ne sont PAS un refus
 *   local : un format que ce poste ne décode pas peut être parfaitement sain.
 *   Seul un côté mesuré et trop court refuse.
 */
export async function checkBeforeUpload(file: File, measure: ImageMeasure): Promise<string | null> {
  if (file.size === 0) {
    return refusal('le fichier est vide.');
  }
  if (file.size > MEDIA_LIMITS.maxBytes) {
    return refusal(
      `${megabytes(file.size)} Mo dépassent la limite de ${megabytes(MEDIA_LIMITS.maxBytes)} Mo.`,
    );
  }
  if (!ACCEPTED.includes(file.type)) {
    const shown = file.type === '' ? 'inconnu' : file.type;
    return refusal(`format non accepté — PNG, JPEG ou WebP attendus (reçu : ${shown}).`);
  }
  const size = await measure(file);
  const min = MEDIA_LIMITS.minEdgePixels;
  if (size !== null && (size.width < min || size.height < min)) {
    return refusal(
      `${String(size.width)}×${String(size.height)} est trop petit — ${String(min)} px minimum sur chaque côté.`,
    );
  }
  return null;
}

function refusal(reason: string): string {
  return `Visuel refusé : ${reason}`;
}
