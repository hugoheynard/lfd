import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef, FoldToastService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { TvaRateFormPanel } from '../tva-rate-form-panel/tva-rate-form-panel';
import { TvaStore } from '../tva-store';

/**
 * Le refus tel que le backend le renvoie sur un taux déjà pris : un 409 dont le
 * corps porte le `message` posé par `AppErrorFilter`. La forme compte — c'est
 * elle que `httpErrorMessage` sait lire, et un faux approximatif testerait le
 * repli au lieu du vrai message.
 */
const CONFLICT = {
  status: 409,
  error: { code: 'commerce.tva_rate_conflict', message: 'Un taux de TVA existe déjà à 5,5 %.' },
};

const RATE = {
  id: 'tva_1',
  name: 'Réduit',
  description: '',
  percent: 5.5,
  usage: { emporter: 0, surPlace: 0 },
};

/** Le bouton portant ce libellé — on pilote l'écran, pas ses champs privés. */
function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (found === undefined) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

describe('TvaRateFormPanel — un taux déjà pris', () => {
  it('laisse le panneau ouvert et explique dans un toast qui s’efface', async () => {
    const closed: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: FoldPanelRef, useValue: { close: (v: unknown) => closed.push(v) } },
      ],
    });
    const toasts = TestBed.inject(FoldToastService);
    vi.spyOn(TestBed.inject(TvaStore), 'update').mockRejectedValue(CONFLICT);

    const fixture = TestBed.createComponent(TvaRateFormPanel);
    fixture.componentRef.setInput('data', { rate: RATE });
    fixture.detectChanges();

    button(fixture.nativeElement as HTMLElement, 'Enregistrer').click();
    await fixture.whenStable();

    // Le panneau ne se ferme PAS : le champ est encore là pour corriger.
    expect(closed).toEqual([]);
    const toast = toasts.toasts()[0];
    expect(toast?.message).toContain('existe déjà à 5,5 %');
    expect(toast?.variant).toBe('error');
    // Et il s'efface — un refus rattrapable n'a pas à rester en travers.
    expect(toast?.durationMs).toBeGreaterThan(0);
  });
});
