import { describe, expect, it } from 'vitest';

import type { QualityCheckView } from '@lfd/contracts';

import {
  canRender,
  type DraftPhoto,
  historyOf,
  photoRefusal,
  roomFor,
  uploadIdsOf,
} from './quality-draft';

const READY: DraftPhoto = { key: 1, preview: 'blob:a', status: 'ready', uploadId: 'up-1' };
const UPLOADING: DraftPhoto = { key: 2, preview: 'blob:b', status: 'uploading' };
const FAILED: DraftPhoto = { key: 3, preview: 'blob:c', status: 'failed', reason: 'non' };

function check(id: string, target: QualityCheckView['target']): QualityCheckView {
  return {
    id,
    target,
    verdict: 'ok',
    note: null,
    checkedBy: 'staff',
    checkedByName: null,
    checkedAt: 'x',
    photos: [],
  };
}

describe('le brouillon d’un contrôle', () => {
  /** §0 : la note est obligatoire dès la réserve ; la photo, jamais. */
  it('exige une note dès la réserve, et une note d’espaces n’en est pas une', () => {
    expect(canRender('ok', '', [])).toBe(true);
    expect(canRender('warning', '', [])).toBe(false);
    expect(canRender('blocking', '   ', [])).toBe(false);
    expect(canRender('blocking', 'Brûlés dessous', [])).toBe(true);
  });

  it('attend que chaque photo soit déposée, et refuse une photo en échec laissée là', () => {
    expect(canRender('ok', '', [READY])).toBe(true);
    expect(canRender('ok', '', [READY, UPLOADING])).toBe(false);
    expect(canRender('ok', '', [FAILED])).toBe(false);
  });

  it('ne rattache que les photos déposées, dans l’ordre du choix', () => {
    expect(uploadIdsOf([READY, UPLOADING, { ...READY, key: 4, uploadId: 'up-4' }])).toEqual([
      'up-1',
      'up-4',
    ]);
  });

  it('borne à six photos', () => {
    expect(roomFor([])).toBe(6);
    expect(roomFor(Array.from({ length: 6 }, (_, key) => ({ ...READY, key })))).toBe(0);
  });

  it('refuse avant le dépôt ce que le serveur refuserait', () => {
    expect(photoRefusal({ size: 1000, type: 'image/jpeg' })).toBeNull();
    expect(photoRefusal({ size: 11 * 1024 * 1024, type: 'image/jpeg' })).toBe(
      'Photo trop lourde : 10 Mo au plus.',
    );
    expect(photoRefusal({ size: 10, type: 'application/pdf' })).toBe(
      'Ce fichier n’est pas une image.',
    );
  });

  it('ne garde de l’historique que les verdicts de la cible', () => {
    const checks = [
      check('1', { kind: 'line', sku: 'cro', quantitySeen: 96 }),
      check('2', { kind: 'line', sku: 'pac', quantitySeen: 12 }),
      check('3', { kind: 'order', orderId: 'o-1' }),
    ];

    expect(historyOf(checks, { kind: 'line', sku: 'cro' }).map((c) => c.id)).toEqual(['1']);
    expect(historyOf(checks, { kind: 'order', orderId: 'o-1' }).map((c) => c.id)).toEqual(['3']);
  });
});
