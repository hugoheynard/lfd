import { signal } from '@angular/core';
import type {
  AmendCompanyMercurialePayload,
  MercurialeAmendmentPreviewView,
  PosedMercurialeView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AmendmentPreview, type AmendmentApi } from '../amendment-preview';
import { STATE } from './amendment-fixture';

/** **L'aperçu d'un avenant** : sa fraîcheur, et ce que dit un échec. */

const VIEW: MercurialeAmendmentPreviewView = {
  at: '2026-11-11T10:00:00.000Z',
  basedOnAmendmentId: null,
  state: STATE,
  items: [],
  refusals: [],
};

const BODY: AmendCompanyMercurialePayload = {
  validTo: null,
  reason: 'Aperçu',
  lines: [{ sku: 'BRI', unitPriceMillicents: 180_000 }],
  endedSkus: [],
};

function previewWith(fails: boolean): AmendmentPreview {
  const api: AmendmentApi = {
    previewAmendment: () => (fails ? Promise.reject(new Error('x')) : Promise.resolve(VIEW)),
    amend: () => Promise.resolve({}),
  };
  return new AmendmentPreview({
    api,
    companyId: signal('co_1'),
    mercuriale: signal({ id: 'merc_1' } as PosedMercurialeView),
  });
}

describe('AmendmentPreview', () => {
  it('l’ouverture n’est fraîche pour aucun corps ; un recalcul l’est pour le sien', async () => {
    const preview = previewWith(false);
    expect(await preview.open(BODY)).toBe(VIEW);
    expect(preview.loadState()).toBe('ready');
    expect(preview.isFreshFor(BODY)).toBe(false);
    expect(await preview.refresh(BODY)).toBe(true);
    expect(preview.isFreshFor(BODY)).toBe(true);
    expect(preview.isFreshFor({ ...BODY, lines: [] })).toBe(false);
  });

  it('un échec d’ouverture change l’écran ; un échec de recalcul se signale seulement', async () => {
    const preview = previewWith(true);
    expect(await preview.open(BODY)).toBeNull();
    expect(preview.loadState()).toBe('error');
    expect(await preview.refresh(BODY)).toBe(false);
    expect(preview.failed()).toBe(true);
    expect(preview.checking()).toBe(false);
  });
});
