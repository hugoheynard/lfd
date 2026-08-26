import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef, FoldToastService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { LocationFormPanel } from '../location-form-panel/location-form-panel';
import { LocationStore } from '../location-store';
import type { Location } from '../../data/models';

/**
 * Le refus tel que le backend le renvoie sur un emplacement encore coché : un
 * 409 dont le corps porte le `message` posé par `AppErrorFilter`. La forme
 * compte — c'est elle que `httpErrorMessage` sait lire, et un faux approximatif
 * testerait le repli au lieu du vrai message.
 */
const IN_USE = {
  status: 409,
  error: {
    code: 'locations.location.in_use',
    message: 'Emplacement encore vendeur : 3 famille(s) le cochent.',
  },
};

function location(over: Partial<Location> = {}): Location {
  return {
    id: 'emp_1',
    name: 'Village',
    clickCollect: true,
    surPlace: false,
    baseUrl: '',
    tables: [],
    usedByCategories: 0,
    ...over,
  };
}

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

interface Mounted {
  host: HTMLElement;
  store: LocationStore;
  toasts: FoldToastService;
  closed: unknown[];
  detect: () => void;
  stable: () => Promise<unknown>;
}

function mount(data?: { mode: 'edit' | 'delete'; location: Location }): Mounted {
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: FoldPanelRef, useValue: { close: (v: unknown) => closed.push(v) } },
    ],
  });
  const fixture = TestBed.createComponent(LocationFormPanel);
  if (data !== undefined) {
    fixture.componentRef.setInput('data', data);
  }
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(LocationStore),
    toasts: TestBed.inject(FoldToastService),
    closed,
    detect: () => fixture.detectChanges(),
    stable: () => fixture.whenStable(),
  };
}

describe('LocationFormPanel — supprimer un emplacement encore vendeur', () => {
  /**
   * Le référentiel refuse tant qu'une famille le coche. Le panneau offrait
   * pourtant un bouton armé et laissait le refus arriver après le clic — alors
   * que le panneau des taux, à deux dossiers d'ici, désarme le sien pour
   * exactement cette raison.
   */
  it("dit le refus AVANT le clic, et n'offre rien à retaper", () => {
    const { host } = mount({ mode: 'delete', location: location({ usedByCategories: 3 }) });

    expect(host.textContent).toContain('Suppression impossible');
    expect(host.textContent).toContain('3 famille(s)');
    expect(host.querySelectorAll('fold-input')).toHaveLength(0);
    expect(button(host, 'Supprimer définitivement').disabled).toBe(true);
  });

  it('propose la confirmation quand personne ne le coche', () => {
    const { host } = mount({ mode: 'delete', location: location({ usedByCategories: 0 }) });

    expect(host.textContent).toContain('Zone dangereuse');
    expect(host.textContent).not.toContain('Suppression impossible');
  });

  /**
   * Il affichait `caught.message` — donc « Http failure response for
   * http://… : 409 Conflict » là où le backend avait pris soin de dire quoi
   * faire.
   */
  it('rend le message du référentiel, pas celui du transport', async () => {
    const { host, store, toasts, closed, detect, stable } = mount({
      mode: 'delete',
      location: location({ usedByCategories: 0 }),
    });
    vi.spyOn(store, 'remove').mockRejectedValue(IN_USE);
    const input = host.querySelector('fold-input input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('champ de confirmation introuvable');
    }
    input.value = 'Village';
    input.dispatchEvent(new Event('input'));
    detect();

    button(host, 'Supprimer définitivement').click();
    await stable();

    expect(toasts.toasts()[0]?.message).toContain('3 famille(s) le cochent');
    expect(toasts.toasts()[0]?.message).not.toContain('Http failure');
    // Le panneau reste ouvert : il y a quelque chose à corriger ailleurs.
    expect(closed).toEqual([]);
  });
});

describe('LocationFormPanel — la création', () => {
  it("n'annonce PAS un enregistrement qui n'a pas eu lieu", async () => {
    // `persist` sortait en silence sur un nom vide, et `submit` fermait quand
    // même le panneau avec `close(true)` — soit un succès pour un non-geste.
    const { host, store, closed, stable } = mount();
    const create = vi.spyOn(store, 'create');

    // Le bouton est désarmé ; on force l'appel comme le ferait un raccourci.
    button(host, "Ajouter l'emplacement").click();
    await stable();

    expect(create).not.toHaveBeenCalled();
    expect(closed).toEqual([]);
  });
});
