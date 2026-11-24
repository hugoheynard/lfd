import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CatalogueAudience } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { VARIANT_AUDIENCE_NEEDS_TILES, VariantAudienceForm } from './variant-audience-form';

interface FakeVariant {
  readonly id: string;
  readonly isDefault: boolean;
  readonly audience: CatalogueAudience | null;
}

type Write = (
  productId: string,
  variantId: string,
  value: CatalogueAudience | null,
) => Promise<void>;

function setup(write: Write, options: { selected?: string; tiles?: boolean } = {}) {
  const variants = signal<readonly FakeVariant[]>([
    { id: 'v-6', isDefault: true, audience: null },
    { id: 'v-8', isDefault: false, audience: null },
  ]);
  const said: string[] = [];
  const store = {
    variants,
    selectedVariantId: () => options.selected ?? 'v-8',
    productId: () => 'p-buche',
    variantsAsTiles: signal(options.tiles ?? true),
    audience: signal<CatalogueAudience | null>(null),
    familyAudience: signal<CatalogueAudience | null>('both'),
    setVariantAudience: (variantId: string, audience: CatalogueAudience | null) =>
      variants.update((all) =>
        all.map((entry) => (entry.id === variantId ? { ...entry, audience } : entry)),
      ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductFormStore, useValue: store },
      { provide: ProductHttpApi, useValue: { setVariantAudience: write } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          error: (error: unknown, fallback: string) =>
            said.push(`ko:${error instanceof Error ? error.message : fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(VariantAudienceForm);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host, form: fixture.componentInstance, variants, said };
}

describe('VariantAudienceForm', () => {
  it('propose de suivre la fiche, en nommant son audience, puis les quatre audiences', () => {
    const { form } = setup(async () => undefined);
    expect(form['options']().map((option) => option.label)).toEqual([
      'Comme la fiche (Les deux)',
      'Pros',
      'Public',
      'Les deux',
      'Réassort des boutiques seulement',
    ]);
    expect(form['choice']()).toBe('product');
  });

  it('écrit tout de suite sur la déclinaison ouverte, et `null` pour suivre la fiche', async () => {
    const sent: [string, string, CatalogueAudience | null][] = [];
    const { form, variants, said } = setup(async (productId, variantId, value) => {
      sent.push([productId, variantId, value]);
    });
    await form['onChange']('pro');
    await form['onChange']('product');
    expect(sent).toEqual([
      ['p-buche', 'v-8', 'pro'],
      ['p-buche', 'v-8', null],
    ]);
    expect(variants().map((entry) => entry.audience)).toEqual([null, null]);
    expect(said).toEqual([
      'ok:Audience de la déclinaison enregistrée.',
      "ok:La déclinaison suit l'audience de sa fiche.",
    ]);
  });

  it('un refus remet le choix et dit le message du serveur', async () => {
    const { form, variants, said } = setup(async () => {
      throw new Error('La fiche ne montre pas chaque déclinaison.');
    });
    await form['onChange']('public');
    expect(variants().map((entry) => entry.audience)).toEqual([null, null]);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(['ko:La fiche ne montre pas chaque déclinaison.']);
  });

  it('est grisé avec sa raison sur une fiche sans vignettes', () => {
    const { form, host } = setup(async () => undefined, { tiles: false });
    expect(host.querySelector('fold-listbox')).not.toBeNull();
    expect(form['needsTiles']()).toBe(true);
    expect(form['hint']()).toBe(VARIANT_AUDIENCE_NEEDS_TILES);
  });

  it('est absent sur le défaut, qui suit la fiche', async () => {
    const sent: unknown[] = [];
    const { host, form } = setup(async (...args) => void sent.push(args), { selected: 'v-6' });
    expect(host.querySelector('fold-listbox')).toBeNull();
    expect(host.textContent).toContain('elle la suit toujours');
    await form['onChange']('pro');
    expect(sent).toEqual([]);
  });
});
