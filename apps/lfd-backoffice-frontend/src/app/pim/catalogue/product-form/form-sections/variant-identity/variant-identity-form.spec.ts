import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { LocalizedText } from '@lfd/pim-contracts';

import { NotifyService } from '../../../../../notify.service';
import type { Variant } from '../../../../data/models';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { VariantIdentityForm } from './variant-identity-form';

type Write = (productId: string, variantId: string, name: LocalizedText) => Promise<void>;

function variant(id: string, isDefault: boolean, name: LocalizedText): Partial<Variant> {
  return { id, isDefault, name, internalLabel: name.fr ?? '' };
}

function setup(write: Write, isDefault = false) {
  const variants = signal([variant('v-boite', isDefault, { fr: 'Boîte de 220 g' })]);
  const accepted: [string, LocalizedText][] = [];
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProductFormStore,
        useValue: {
          variants,
          selectedVariantId: () => 'v-boite',
          productId: () => 'p-flor',
          acceptVariantShopName: (id: string, name: LocalizedText) => accepted.push([id, name]),
        },
      },
      { provide: ProductHttpApi, useValue: { setVariantShopName: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(VariantIdentityForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, accepted, said };
}

const input = (fixture: { nativeElement: unknown }) =>
  (fixture.nativeElement as HTMLElement).querySelector('fold-input');

describe('VariantIdentityForm', () => {
  it('dit que l’atelier et le colisage lisent ce nom, pour les commandes suivantes', () => {
    const { fixture, form } = setup(async () => undefined);
    expect(form['hint']()).toContain(
      'L’atelier et le colisage le lisent pour les commandes suivantes',
    );
    expect(form['hint']()).not.toContain('traductions');
    expect(input(fixture)).not.toBeNull();
  });

  it('enregistre seul, tout de suite, le nom de la déclinaison ouverte', async () => {
    const sent: [string, string, LocalizedText][] = [];
    const { form, accepted, said } = setup(async (productId, variantId, name) => {
      sent.push([productId, variantId, name]);
    });
    form['name'].set('Coffret de florentins');
    await form['save']();
    expect(sent).toEqual([['p-flor', 'v-boite', { fr: 'Coffret de florentins' }]]);
    expect(accepted).toEqual([['v-boite', { fr: 'Coffret de florentins' }]]);
    expect(said).toEqual(['ok:Le nom en boutique est enregistré.']);
  });

  it('n’envoie rien quand le nom n’a pas changé', async () => {
    const sent: string[] = [];
    const { form } = setup(async (_p, variantId) => {
      sent.push(variantId);
    });
    await form['save']();
    expect(sent).toEqual([]);
  });

  it('un refus ne pose rien sur la déclinaison et le dit', async () => {
    const { form, accepted, said } = setup(async () => {
      throw new Error('refus');
    });
    form['name'].set('Coffret');
    await form['save']();
    expect(accepted).toEqual([]);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(["ko:Le nom en boutique n'a pas pu être enregistré."]);
  });

  it('sur le défaut, dit qu’il prend les traductions de la fiche', () => {
    const { form } = setup(async () => undefined, true);
    expect(form['hint']()).toContain(
      'Tant que ce nom est celui de la fiche, il en prend les traductions.',
    );
  });
});
