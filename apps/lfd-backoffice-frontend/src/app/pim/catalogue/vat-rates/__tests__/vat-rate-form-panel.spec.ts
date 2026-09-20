import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef, FoldToastService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { VatRateFormPanel } from '../vat-rate-form-panel/vat-rate-form-panel';
import { VatRateStore } from '../vat-store';

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
  usage: {},
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

describe('VatRateFormPanel — un taux déjà pris', () => {
  it('laisse le panneau ouvert et explique dans un toast qui s’efface', async () => {
    const closed: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: FoldPanelRef, useValue: { close: (v: unknown) => closed.push(v) } },
      ],
    });
    const toasts = TestBed.inject(FoldToastService);
    vi.spyOn(TestBed.inject(VatRateStore), 'update').mockRejectedValue(CONFLICT);

    const fixture = TestBed.createComponent(VatRateFormPanel);
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

describe('VatRateFormPanel — un taux visé par le SEUL contexte B2B', () => {
  it('refuse la suppression, comme la base le ferait', async () => {
    // Le total additionnait deux contextes sur trois : un taux que seules des
    // familles B2B visaient totalisait zéro, le panneau offrait « Supprimer »,
    // et la base refusait APRÈS le clic. Le compte porte maintenant tous les
    // contextes, sans en nommer aucun.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: FoldPanelRef, useValue: { close: () => undefined } },
      ],
    });

    const fixture = TestBed.createComponent(VatRateFormPanel);
    fixture.componentRef.setInput('data', { rate: { ...RATE, usage: { b2b: 1 } } });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Supprimer ce taux').click();
    fixture.detectChanges();

    // La zone dangereuse dit POURQUOI et n'offre pas le geste : le compte porte
    // désormais le contexte B2B, qu'il additionnait à zéro.
    // « ou fiche(s) » n'est pas cosmétique : le compte inclut les DÉROGATIONS
    // de fiches, et ne nommer que les familles envoyait chercher là où il n'y
    // avait rien.
    expect(host.textContent).toContain('1 famille(s) ou fiche(s)');
    expect(
      [...host.querySelectorAll('button')].some((b) =>
        (b.textContent ?? '').includes('définitivement'),
      ),
    ).toBe(false);
  });
});
