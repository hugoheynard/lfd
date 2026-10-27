import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { IngredientHttpApi } from '../ingredient-http-api';
import { ProvenanceStore } from '../provenance.store';
import { MILK_REMOVED } from '../__tests__/propagation-fixtures';
import { IngredientPropagation } from './ingredient-propagation';

const CHANGE = { key: 'beurre-doux', added: [], removed: ['AM'] };

function setup(api: Partial<Record<keyof IngredientHttpApi, unknown>>) {
  const success = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: IngredientHttpApi, useValue: api },
      { provide: NotifyService, useValue: { success } },
      { provide: FoldPanelHostService, useValue: { open: vi.fn() } },
      {
        provide: ProvenanceStore,
        useValue: {
          allergenEntries: signal([
            { code: 'AM', label: 'Lait', incoCategory: 'milk', incoLabel: 'Lait' },
          ]),
          ensureAllergens: () => Promise.resolve(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(IngredientPropagation);
  fixture.componentRef.setInput('change', CHANGE);
  const settled = vi.fn();
  fixture.componentInstance.settled.subscribe(settled);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const settle = (check: () => void) =>
    vi.waitFor(() => {
      fixture.detectChanges();
      check();
    });
  return { host, success, settled, settle };
}

describe('IngredientPropagation', () => {
  it('lit l’aperçu du diff et dit le message en libellés français', async () => {
    const preview = vi.fn().mockResolvedValue(MILK_REMOVED);
    const { host, settle } = setup({ allergenPropagation: preview });

    await settle(() => {
      expect(host.querySelector('[data-propagation-message]')?.textContent).toContain(
        '« Lait » retiré de Beurre doux touche 3 fiches',
      );
    });
    expect(preview).toHaveBeenCalledWith('beurre-doux', [], ['AM']);
  });

  it('se tait quand aucune fiche ne cite l’ingrédient', async () => {
    const empty = {
      ...MILK_REMOVED,
      products: [],
      counts: { ...MILK_REMOVED.counts, productsTouched: 0 },
    };
    const preview = vi.fn().mockResolvedValue(empty);
    const { host, settle } = setup({ allergenPropagation: preview });

    await settle(() => {
      expect(preview).toHaveBeenCalled();
    });
    expect(host.querySelector('fold-callout')).toBeNull();
  });

  it('applique tout et annonce le N de l’aperçu confirmé, pas de l’aperçu relu', async () => {
    const reread = { ...MILK_REMOVED, products: [] };
    const apply = vi.fn().mockResolvedValue(reread);
    const { host, success, settled, settle } = setup({
      allergenPropagation: vi.fn().mockResolvedValue(MILK_REMOVED),
      applyAllergenPropagation: apply,
    });

    let button: HTMLButtonElement | undefined;
    await settle(() => {
      button = [...host.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Appliquer à 2 fiches'),
      );
      expect(button).toBeDefined();
    });
    button?.click();

    await settle(() => {
      expect(success).toHaveBeenCalledWith('2 fiches mises à jour');
    });
    expect(settled).toHaveBeenCalled();
  });

  it('dit l’échec de l’aperçu en alerte, avec le message serveur', async () => {
    const { host, settle } = setup({
      allergenPropagation: vi.fn().mockRejectedValue(new Error('panne')),
    });

    await settle(() => {
      expect(host.textContent).toContain("n'ont pas pu être relues");
    });
  });
});
