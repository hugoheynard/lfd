import { MEDIA_LIMITS } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { checkBeforeUpload, type ImageMeasure } from './upload-check';

/**
 * Ce que ces cas tiennent : **le poste refuse ce que le serveur refuserait,
 * avec la même phrase**, et laisse passer ce dont il doute — le serveur
 * reste l'autorité.
 */

/** Un fichier dont on fixe la TAILLE sans allouer ses octets. */
function file(name: string, type: string, bytes: number): File {
  const made = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(made, 'size', { value: bytes });
  return made;
}

const measured =
  (width: number, height: number): ImageMeasure =>
  async () => ({ width, height });
const unreadable: ImageMeasure = async () => null;

describe('vérifier un fichier avant de l’envoyer', () => {
  it('laisse passer une image conforme', async () => {
    expect(
      await checkBeforeUpload(file('a.jpg', 'image/jpeg', 2_000_000), measured(1600, 1200)),
    ).toBeNull();
  });

  it('refuse un fichier vide', async () => {
    expect(await checkBeforeUpload(file('a.png', 'image/png', 0), measured(800, 800))).toBe(
      'Visuel refusé : le fichier est vide.',
    );
  });

  it('refuse un fichier trop lourd, en Mo à la française', async () => {
    const heavy = file('a.png', 'image/png', 12.5 * 1024 * 1024);
    expect(await checkBeforeUpload(heavy, measured(800, 800))).toBe(
      'Visuel refusé : 12,5 Mo dépassent la limite de 10,0 Mo.',
    );
  });

  it('accepte le poids limite exact', async () => {
    const edge = file('a.png', 'image/png', MEDIA_LIMITS.maxBytes);
    expect(await checkBeforeUpload(edge, measured(800, 800))).toBeNull();
  });

  it('refuse un format hors liste, en nommant ce qu’il a reçu', async () => {
    expect(await checkBeforeUpload(file('a.svg', 'image/svg+xml', 100), measured(800, 800))).toBe(
      'Visuel refusé : format non accepté — PNG, JPEG ou WebP attendus (reçu : image/svg+xml).',
    );
    expect(await checkBeforeUpload(file('a', '', 100), measured(800, 800))).toBe(
      'Visuel refusé : format non accepté — PNG, JPEG ou WebP attendus (reçu : inconnu).',
    );
  });

  it('refuse une image dont UN côté est trop court', async () => {
    expect(await checkBeforeUpload(file('a.webp', 'image/webp', 100), measured(1200, 150))).toBe(
      'Visuel refusé : 1200×150 est trop petit — 200 px minimum sur chaque côté.',
    );
  });

  it('accepte 200 px pile', async () => {
    expect(await checkBeforeUpload(file('a.png', 'image/png', 100), measured(200, 200))).toBeNull();
  });

  it('laisse le serveur juger des dimensions que le navigateur ne lit pas', async () => {
    expect(await checkBeforeUpload(file('a.png', 'image/png', 100), unreadable)).toBeNull();
  });

  it('ne mesure pas un fichier déjà refusé pour son poids', async () => {
    let measuredCount = 0;
    const counting: ImageMeasure = async () => {
      measuredCount += 1;
      return { width: 800, height: 800 };
    };
    await checkBeforeUpload(file('a.png', 'image/png', 0), counting);
    expect(measuredCount).toBe(0);
  });
});
