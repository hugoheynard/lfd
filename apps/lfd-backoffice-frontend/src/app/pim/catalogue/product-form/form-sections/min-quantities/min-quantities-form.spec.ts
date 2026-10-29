import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SalesContextView, SetVariantMinQuantitiesPayload } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { EMPTY_NUTRITION, type Variant } from '../../../../data/models';
import { SalesContextStore } from '../../../../sales-contexts/sales-context-store';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { MinQuantitiesForm } from './min-quantities-form';

type Sent = SetVariantMinQuantitiesPayload['minQuantities'];

const CONTEXTS: readonly SalesContextView[] = [
  { key: 'takeaway', label: 'À emporter', position: 0 },
  { key: 'eatIn', label: 'Sur place', position: 1 },
  { key: 'b2b', label: 'B2B', position: 2 },
];

function variant(id: string, overrides: Partial<Variant> = {}): Variant {
  return {
    id,
    sku: `SKU-${id}`,
    name: { fr: id },
    isDefault: false,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    saleUnit: 'piece',
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    minQuantities: { pro: {}, public: {} },
    minQuantityFollowsDefault: false,
    allergens: null,
    mayContain: [],
    nutrition: EMPTY_NUTRITION,
    ...overrides,
  };
}

function setup(
  write: (payload: Sent) => Promise<void>,
  variants: readonly Variant[],
  selected: string,
) {
  const said: string[] = [];
  const reloads: number[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProductFormStore,
        useValue: {
          variants: signal(variants),
          selectedVariantId: signal(selected),
          productId: () => 'p-tarte',
          reloadVariants: async () => {
            reloads.push(1);
          },
        },
      },
      { provide: SalesContextStore, useValue: { items: signal(CONTEXTS) } },
      {
        provide: ProductHttpApi,
        useValue: {
          setVariantMinQuantities: (_id: string, _variantId: string, payload: Sent) =>
            write(payload),
        },
      },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(MinQuantitiesForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, said, reloads };
}

const DEFAULT = variant('v1', {
  isDefault: true,
  minQuantities: { pro: { b2b: 6 }, public: {} },
});

describe('MinQuantitiesForm — la quantité minimale d’une déclinaison', () => {
  it('part de l’état chargé et n’offre rien à enregistrer tant que rien ne change', () => {
    const { form } = setup(async () => undefined, [DEFAULT], 'v1');
    expect(form['cell']('pro', 'b2b')).toBe(6);
    expect(form['cell']('public', 'takeaway')).toBeNull();
    expect(form['canSave']()).toBe(false);
  });

  it('range chaque contexte sous sa clientèle : trois champs, aucune paire croisée', () => {
    const { form, fixture } = setup(async () => undefined, [DEFAULT], 'v1');
    expect(
      form['groups']().map((group) => [group.label, group.fields.map((field) => field.label)]),
    ).toEqual([
      ['Particuliers (B2C)', ['À emporter', 'Sur place']],
      ['Professionnels (B2B)', ['Retrait et livraison']],
    ]);
    expect(fixture.nativeElement.querySelectorAll('fold-number-input')).toHaveLength(3);
  });

  it('refuse localement un minimum sous 2', () => {
    const { form } = setup(async () => undefined, [DEFAULT], 'v1');
    form['setCell']('public', 'takeaway', 1);
    expect(form['invalid']()).toBe(true);
    expect(form['canSave']()).toBe(false);
  });

  it('envoie la grille sans ses cases vides, puis relit la fiche', async () => {
    const sent: Sent[] = [];
    const { form, said, reloads } = setup(
      async (payload) => {
        sent.push(payload);
      },
      [DEFAULT],
      'v1',
    );
    form['setCell']('public', 'takeaway', 3);
    form['setCell']('pro', 'b2b', null);
    await form['save']();
    expect(sent).toEqual([{ pro: {}, public: { takeaway: 3 } }]);
    expect(said).toEqual(['ok:Quantité minimale enregistrée.']);
    expect(reloads).toHaveLength(1);
  });

  it('sur une autre déclinaison, « suit le défaut » envoie `follow` et montre la grille du défaut', async () => {
    const sent: Sent[] = [];
    const { form } = setup(
      async (payload) => {
        sent.push(payload);
      },
      [DEFAULT, variant('v2')],
      'v2',
    );
    expect(form['isDefault']()).toBe(false);
    form['follows'].set(true);
    expect(form['cell']('pro', 'b2b')).toBe(6);
    await form['save']();
    expect(sent).toEqual(['follow']);
  });

  it('un refus remet la grille dans l’état chargé', async () => {
    const { form, said } = setup(
      async () => {
        throw new Error('refus');
      },
      [DEFAULT],
      'v1',
    );
    form['setCell']('public', 'takeaway', 4);
    await form['save']();
    expect(form['cell']('public', 'takeaway')).toBeNull();
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:La quantité minimale n'a pas pu être enregistrée."]);
  });

  it('une déclinaison au poids n’a pas de grille', () => {
    const { form, fixture } = setup(
      async () => undefined,
      [variant('v1', { isDefault: true, saleUnit: 'weight' })],
      'v1',
    );
    expect(form['soldByWeight']()).toBe(true);
    expect(fixture.nativeElement.querySelector('fold-number-input')).toBeNull();
  });
});
