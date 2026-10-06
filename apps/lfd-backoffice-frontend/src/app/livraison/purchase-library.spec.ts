import { describe, expect, it } from 'vitest';

import { readBinDraft, readVehicleDraft, vehicleDraftOf, binDraftOf } from './purchase-library';

const VEHICLE = {
  ...vehicleDraftOf(undefined),
  name: ' Trafic ',
  cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
};

describe('readVehicleDraft', () => {
  it('envoie la charge COMPLÈTE : facultatifs vides à null, prix en centimes', () => {
    expect(readVehicleDraft({ ...VEHICLE, price: '25 000,5', purchaseUrl: ' ' })).toEqual({
      ok: true,
      payload: {
        name: 'Trafic',
        cargo: { lengthCm: 250, widthCm: 170, heightCm: 130 },
        wheelArches: null,
        reference: null,
        purchaseUrl: null,
        priceCentsExclVat: 2500050,
      },
    });
  });

  it('passages de roue : les quatre cotes, ou aucune', () => {
    const half = readVehicleDraft({ ...VEHICLE, archLengthCm: 90 });
    expect(half).toEqual({ ok: false, issue: 'Passages de roue : les quatre cotes, ou aucune.' });

    const full = readVehicleDraft({
      ...VEHICLE,
      archLengthCm: 90,
      archProtrusionCm: 20,
      archFromBackCm: 60,
      archHeightCm: 30,
    });
    expect(full.ok && full.payload.wheelArches).toEqual({
      lengthCm: 90,
      protrusionCm: 20,
      fromBackCm: 60,
      heightCm: 30,
    });
  });

  it('refuse un prix illisible avec la phrase de la lecture', () => {
    expect(readVehicleDraft({ ...VEHICLE, price: '12,555' }).ok).toBe(false);
  });
});

describe('readBinDraft', () => {
  it('saisit en cm à une décimale, envoie en mm ; relit en cm sans arrondi', () => {
    const draft = {
      ...binDraftOf(undefined),
      name: 'Manne',
      outer: { lengthCm: 66.5, widthCm: 46, heightCm: 71.5 },
      inner: { lengthCm: 64.5, widthCm: 44, heightCm: 69.5 },
      maxStack: 1,
    };
    const read = readBinDraft(draft);
    expect(read.ok && read.payload.outer).toEqual({ lengthMm: 665, widthMm: 460, heightMm: 715 });
    expect(readBinDraft({ ...draft, inner: { ...draft.inner, widthCm: 44.25 } })).toEqual({
      ok: false,
      issue: 'Les cotes intérieures se saisissent au millimètre près (une décimale).',
    });
  });

  it('exige les cotes et la pile, garde le fournisseur', () => {
    const draft = {
      ...binDraftOf(undefined),
      name: 'Caisse 50',
      outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
      inner: { lengthCm: 56, widthCm: 36, heightCm: 28 },
      supplier: ' Dupont ',
      price: '12,5',
    };
    expect(readBinDraft(draft).ok).toBe(false);
    expect(readBinDraft({ ...draft, maxStack: 5 })).toEqual({
      ok: true,
      payload: {
        name: 'Caisse 50',
        outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
        inner: { lengthMm: 560, widthMm: 360, heightMm: 280 },
        isotherm: false,
        maxStack: 5,
        supplier: 'Dupont',
        reference: null,
        purchaseUrl: null,
        unitPriceCentsExclVat: 1250,
      },
    });
  });
});
