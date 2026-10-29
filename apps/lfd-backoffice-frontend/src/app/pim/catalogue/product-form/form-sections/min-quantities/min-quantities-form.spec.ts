import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SetVariantMinQuantitiesPayload } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { EMPTY_NUTRITION, type Variant } from '../../../../data/models';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { MinQuantitiesForm } from './min-quantities-form';

type Sent = SetVariantMinQuantitiesPayload['minQuantities'];

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
    minQuantities: { pro: null, public: null },
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
  minQuantities: { pro: 6, public: null },
});

describe('MinQuantitiesForm — la quantité minimale d’une déclinaison', () => {
  it('part de l’état chargé et n’offre rien à enregistrer tant que rien ne change', () => {
    const { form } = setup(async () => undefined, [DEFAULT], 'v1');
    expect(form['valueOf']('pro')).toBe(6);
    expect(form['valueOf']('public')).toBeNull();
    expect(form['canSave']()).toBe(false);
  });

  /** Q2 réécrite (Hugo, 2026-10-29) : par audience seulement, aucun contexte de vente. */
  it('montre deux champs, Particuliers puis Professionnels', () => {
    const { form, fixture } = setup(async () => undefined, [DEFAULT], 'v1');
    expect(form['fields'].map((field) => field.label)).toEqual(['Particuliers', 'Professionnels']);
    expect(fixture.nativeElement.querySelectorAll('fold-number-input')).toHaveLength(2);
  });

  it('refuse localement un minimum sous 2', () => {
    const { form } = setup(async () => undefined, [DEFAULT], 'v1');
    form['setValue']('public', 1);
    expect(form['invalid']()).toBe(true);
    expect(form['canSave']()).toBe(false);
  });

  it('envoie les deux minimums, `null` pour un champ vide, puis relit la fiche', async () => {
    const sent: Sent[] = [];
    const { form, said, reloads } = setup(
      async (payload) => {
        sent.push(payload);
      },
      [DEFAULT],
      'v1',
    );
    form['setValue']('public', 3);
    form['setValue']('pro', null);
    await form['save']();
    expect(sent).toEqual([{ pro: null, public: 3 }]);
    expect(said).toEqual(['ok:Quantité minimale enregistrée.']);
    expect(reloads).toHaveLength(1);
  });

  it('sur une autre déclinaison, « suit le défaut » envoie `follow` et montre les minimums du défaut', async () => {
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
    expect(form['valueOf']('pro')).toBe(6);
    await form['save']();
    expect(sent).toEqual(['follow']);
  });

  it('un refus remet les champs dans l’état chargé', async () => {
    const { form, said } = setup(
      async () => {
        throw new Error('refus');
      },
      [DEFAULT],
      'v1',
    );
    form['setValue']('public', 4);
    await form['save']();
    expect(form['valueOf']('public')).toBeNull();
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:La quantité minimale n'a pas pu être enregistrée."]);
  });

  it('une déclinaison au poids n’a pas de minimum en pièces', () => {
    const { form, fixture } = setup(
      async () => undefined,
      [variant('v1', { isDefault: true, saleUnit: 'weight' })],
      'v1',
    );
    expect(form['soldByWeight']()).toBe(true);
    expect(fixture.nativeElement.querySelector('fold-number-input')).toBeNull();
  });
});
