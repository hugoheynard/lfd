import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { VariantCustomRecipeForm } from './variant-custom-recipe-form';

interface FakeVariant {
  readonly id: string;
  readonly customRecipe: boolean;
}

function setup(write: (productId: string, variantId: string, value: boolean) => Promise<void>) {
  const variants = signal<readonly FakeVariant[]>([
    { id: 'v-6', customRecipe: false },
    { id: 'v-8', customRecipe: false },
  ]);
  const said: string[] = [];
  const store = {
    variants,
    selectedVariantId: () => 'v-8',
    productId: () => 'p-buche',
    setVariantCustomRecipe: (variantId: string, customRecipe: boolean) =>
      variants.update((all) =>
        all.map((entry) => (entry.id === variantId ? { ...entry, customRecipe } : entry)),
      ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductFormStore, useValue: store },
      { provide: ProductHttpApi, useValue: { setVariantCustomRecipe: write } },
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
  const fixture = TestBed.createComponent(VariantCustomRecipeForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, variants, said };
}

describe('VariantCustomRecipeForm', () => {
  it('dit ce que la case fait, sans compte attribué', () => {
    const { fixture } = setup(async () => undefined);
    const box = (fixture.nativeElement as HTMLElement).querySelector('fold-checkbox');
    expect(box?.getAttribute('label')).toBe('Sur mesure');
    expect(box?.getAttribute('hint')).toContain('aucun pro ne voit cette déclinaison');
  });

  it('écrit tout de suite sur la déclinaison ouverte, et elle seule', async () => {
    const sent: [string, string, boolean][] = [];
    const { form, variants, said } = setup(async (productId, variantId, value) => {
      sent.push([productId, variantId, value]);
    });
    await form['onChange'](true);
    expect(sent).toEqual([['p-buche', 'v-8', true]]);
    expect(variants().map((entry) => entry.customRecipe)).toEqual([false, true]);
    expect(said).toEqual(['ok:Déclinaison déclarée sur mesure.']);
  });

  it('un refus remet la case et dit le message du serveur', async () => {
    const { form, variants, said } = setup(async () => {
      throw new Error('Le défaut d’une fiche sans vignettes ne peut pas être sur mesure.');
    });
    await form['onChange'](true);
    expect(variants().map((entry) => entry.customRecipe)).toEqual([false, false]);
    expect(form['busy']()).toBe(false);
    expect(said).toEqual(['ko:Le défaut d’une fiche sans vignettes ne peut pas être sur mesure.']);
  });
});
