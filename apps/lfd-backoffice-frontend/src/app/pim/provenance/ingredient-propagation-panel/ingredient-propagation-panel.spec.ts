import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { IngredientHttpApi } from '../ingredient-http-api';
import { MILK_REMOVED } from '../__tests__/propagation-fixtures';
import { IngredientPropagationPanel } from './ingredient-propagation-panel';

function setup(apply = vi.fn().mockResolvedValue(MILK_REMOVED)) {
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FoldPanelRef, useValue: { close } },
      { provide: IngredientHttpApi, useValue: { applyAllergenPropagation: apply } },
    ],
  });
  const fixture = TestBed.createComponent(IngredientPropagationPanel);
  fixture.componentRef.setInput('data', { view: MILK_REMOVED, labelOf: (code: string) => code });
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const applyButton = (): HTMLButtonElement => {
    const button = [...host.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Appliquer'),
    );
    if (button === undefined) {
      throw new Error('bouton « Appliquer » introuvable');
    }
    return button;
  };
  const uncheck = (index: number): void => {
    const box = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index];
    box?.click();
    fixture.detectChanges();
  };
  return { fixture, host, close, apply, applyButton, uncheck };
}

describe('IngredientPropagationPanel', () => {
  it('coche chaque retrait par défaut et propose d’appliquer aux fiches qui changent', () => {
    const { host, applyButton } = setup();

    const boxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect([...boxes].map((box) => box.checked)).toEqual([true, true]);
    expect(applyButton().textContent.trim()).toBe('Appliquer à 2 fiches');
  });

  it('dit la fiche publiée qui perdrait en rouge, et l’éteint quand on décoche', () => {
    const { host, uncheck } = setup();

    expect(host.querySelectorAll('[data-published-loses]')).toHaveLength(1);
    expect(host.textContent).toContain('Deviendra');

    uncheck(0);

    expect(host.querySelectorAll('[data-published-loses]')).toHaveLength(0);
  });

  it('recalcule N et envoie les déclinaisons décochées', async () => {
    const { applyButton, uncheck, apply, close } = setup();

    uncheck(0);
    expect(applyButton().textContent.trim()).toBe('Appliquer à 1 fiche');
    applyButton().click();

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledWith(1);
    });
    expect(apply).toHaveBeenCalledWith('beurre-doux', {
      added: [],
      removed: ['AM'],
      removalsKept: ['v1'],
    });
  });

  it('garde le refus du serveur dans le panneau, sans fermer', async () => {
    const { fixture, host, applyButton, close } = setup(
      vi.fn().mockRejectedValue(new Error('refus')),
    );

    applyButton().click();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.textContent).toContain("Rien n'a été appliqué.");
    });
    expect(close).not.toHaveBeenCalled();
  });
});
