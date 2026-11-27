import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { VariantCustomRecipeCard } from './variant-custom-recipe-card';

interface FakeVariant {
  readonly id: string;
  readonly internalLabel: string;
  readonly isDefault: boolean;
  readonly position: number;
  readonly customRecipe: boolean;
}

function setup(write: (productId: string, variantId: string, value: boolean) => Promise<void>) {
  const variants = signal<readonly FakeVariant[]>([
    { id: 'v-6', internalLabel: 'Boîte de 6', isDefault: true, position: 0, customRecipe: false },
    { id: 'v-8', internalLabel: 'Boîte de 8', isDefault: false, position: 1, customRecipe: true },
  ]);
  const said: string[] = [];
  const store = {
    variants,
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
  const fixture = TestBed.createComponent(VariantCustomRecipeCard);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(host.querySelectorAll<HTMLElement>('[data-custom-recipe-row]'));
  return { fixture, rows, variants, said };
}

/** Ouvre la confirmation d'une ligne, puis renvoie son bouton « Confirmer ». */
function openConfirm(row: HTMLElement): HTMLButtonElement | undefined {
  row.querySelector<HTMLButtonElement>('button')?.click();
  TestBed.tick();
  return Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === 'Confirmer',
  );
}

describe('VariantCustomRecipeCard', () => {
  it('une ligne par déclinaison : libellé et message selon son état', () => {
    const { rows } = setup(async () => undefined);
    const [open, custom] = rows();
    expect(open?.textContent).toContain('Boîte de 6');
    expect(open?.textContent).toContain('Activer sur mesure');
    expect(custom?.textContent).toContain('Désactiver sur mesure');
    const openConfirmButton = openConfirm(open!);
    expect(openConfirmButton).toBeDefined();
    expect(open?.textContent).toContain('Plus aucun pro ne verra cette déclinaison');
    openConfirm(custom!);
    expect(custom?.textContent).toContain(
      'Les comptes clients qui lui sont attribués seront retirés.',
    );
  });

  it("rien n'est envoyé sans confirmation", () => {
    const sent: unknown[] = [];
    const { rows } = setup(async (...args) => {
      sent.push(args);
    });
    rows()[0]?.querySelector<HTMLButtonElement>('button')?.click();
    TestBed.tick();
    expect(sent).toEqual([]);
  });

  it('la confirmation écrit la valeur inverse sur sa déclinaison', async () => {
    const sent: [string, string, boolean][] = [];
    const { rows, variants, said } = setup(async (productId, variantId, value) => {
      sent.push([productId, variantId, value]);
    });
    openConfirm(rows()[1]!)?.click();
    await Promise.resolve();
    expect(sent).toEqual([['p-buche', 'v-8', false]]);
    expect(variants().map((entry) => entry.customRecipe)).toEqual([false, false]);
    expect(said).toEqual(["ok:La déclinaison n'est plus sur mesure."]);
  });

  it('un refus remet l’état et dit le message du serveur', async () => {
    const { rows, variants, said } = setup(async () => {
      throw new Error('Refusé.');
    });
    openConfirm(rows()[0]!)?.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(variants().map((entry) => entry.customRecipe)).toEqual([false, true]);
    expect(said).toEqual(['ko:Refusé.']);
  });
});
