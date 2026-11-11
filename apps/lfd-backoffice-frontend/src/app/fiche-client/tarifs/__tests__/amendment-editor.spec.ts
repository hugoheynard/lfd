import { signal } from '@angular/core';
import type {
  AmendCompanyMercurialePayload,
  MercurialeAmendmentPreviewView,
  PosedMercurialeView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AmendmentEditor } from '../amendment-editor';
import type { AmendmentApi } from '../amendment-preview';
import { STATE, TODAY } from './amendment-fixture';

/**
 * **L'état d'un avenant en cours**, sans écran : l'aperçu d'ouverture, la
 * vérification, l'envoi et le 409 de concurrence.
 */

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  status: 'active',
  ruleCount: 0,
  skuCount: 0,
  createdBy: 'staff_1',
  createdByName: null,
  lines: [],
  amendments: [],
};

const PREVIEW: MercurialeAmendmentPreviewView = {
  at: '2026-11-11T10:00:00.000Z',
  basedOnAmendmentId: 'am_9',
  state: STATE,
  items: [],
  refusals: [],
};

class StubApi implements AmendmentApi {
  readonly previews: AmendCompanyMercurialePayload[] = [];
  readonly sent: AmendCompanyMercurialePayload[] = [];
  readonly keys: string[] = [];
  failure: unknown = null;
  previewAmendment(_c: string, _m: string, body: AmendCompanyMercurialePayload) {
    this.previews.push(body);
    return Promise.resolve(PREVIEW);
  }
  amend(_c: string, _m: string, body: AmendCompanyMercurialePayload, intentKey: string) {
    this.sent.push(body);
    this.keys.push(intentKey);
    return this.failure === null ? Promise.resolve({}) : Promise.reject(this.failure);
  }
}

async function started(mercuriale: PosedMercurialeView = MERCURIALE) {
  const api = new StubApi();
  const editor = new AmendmentEditor({
    api,
    listPromotions: async () => ({ promotions: [] }),
    companyId: signal('co_1'),
    mercuriale: signal(mercuriale),
    categories: signal([]),
    today: TODAY,
  });
  await editor.start();
  return { api, editor };
}

describe('AmendmentEditor', () => {
  it('s’ouvre sur l’état en vigueur, « maintenant », sans changement', async () => {
    const { api, editor } = await started();
    expect(editor.loadState()).toBe('ready');
    expect(api.previews[0]).not.toHaveProperty('validFrom');
    expect(editor.changes()).toBe(0);
  });

  it('une mercuriale à venir s’ouvre à son premier jour', async () => {
    const { editor } = await started({ ...MERCURIALE, validFrom: '2099-11-09T23:00:00.000Z' });
    expect(editor.fromDay()).toBe('2099-11-10');
    expect(editor.beforeLabel()).toBe('Au 10/11/2099');
  });

  /** Régression : une date tapée avant le début de la mercuriale passait, et l'aperçu montrait les prix d'aujourd'hui. */
  it('refuse une date d’effet tapée avant le début de la mercuriale', async () => {
    const { editor } = await started({ ...MERCURIALE, validFrom: '2099-11-09T23:00:00.000Z' });
    editor.draftDay.set(TODAY);
    expect(editor.draftTooEarly()).toBe(true);
    editor.draftDay.set('2099-11-10');
    expect(editor.draftTooEarly()).toBe(false);
  });

  it('refuse de vérifier un avenant vide, puis vérifie un prix changé', async () => {
    const { api, editor } = await started();
    expect(await editor.verify()).toBe(false);
    expect(editor.refusal()).toContain('ne change rien');
    editor.setPrice('BRI', 1.8);
    expect(await editor.verify()).toBe(true);
    expect(editor.refusal()).toBeNull();
    expect(api.previews).toHaveLength(2);
  });

  it('enregistre avec le dernier avenant vu, et refuse sans motif', async () => {
    const { api, editor } = await started();
    editor.setPrice('BRI', 1.8);
    expect(await editor.save()).toBe(false);
    expect(editor.refusal()).toContain('motif');
    editor.reason.set('Renégociation');
    expect(await editor.save()).toBe(true);
    expect(api.sent[0]).toMatchObject({ basedOnAmendmentId: 'am_9', reason: 'Renégociation' });
  });

  it('409 : signale l’avenant passé entre-temps, que « Recharger » efface', async () => {
    const { api, editor } = await started();
    api.failure = {
      error: { code: 'pricing.mercuriale.amendment.amended_meanwhile', message: 'x' },
      status: 409,
    };
    editor.setPrice('BRI', 1.8);
    editor.reason.set('Renégociation');
    expect(await editor.save()).toBe(false);
    expect(editor.amendedMeanwhile()).toBe(true);
    expect(await editor.reload()).toBe(true);
    expect(editor.amendedMeanwhile()).toBe(false);
  });

  it('renvoie la même clé d’intention après un refus, et une neuve après un succès', async () => {
    const { api, editor } = await started();
    api.failure = { error: { code: 'x', message: 'Indisponible' }, status: 503 };
    editor.setPrice('BRI', 1.8);
    editor.reason.set('Renégociation');
    expect(await editor.save()).toBe(false);
    api.failure = null;
    expect(await editor.save()).toBe(true);
    expect(api.keys[1]).toBe(api.keys[0]);

    expect(await editor.save()).toBe(true);
    expect(api.keys[2]).not.toBe(api.keys[1]);
  });

  it('une saisie qui change entre deux essais fait une clé neuve', async () => {
    const { api, editor } = await started();
    api.failure = { error: { code: 'x', message: 'Indisponible' }, status: 503 };
    editor.setPrice('BRI', 1.8);
    editor.reason.set('Renégociation');
    await editor.save();
    editor.reason.set('Autre motif');
    await editor.save();
    expect(api.keys[1]).not.toBe(api.keys[0]);
  });
});
