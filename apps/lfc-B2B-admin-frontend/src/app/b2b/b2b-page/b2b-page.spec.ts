import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import type { PendingDeliveryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { B2bPage } from './b2b-page';
import { PermissionsStore } from '../../auth/permissions.store';
import { ReceptionService } from '../reception/reception.service';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **Le bandeau d'arrivée de l'espace B2B.**
 *
 * Ce qu'il tient : une livraison qui attend se voit depuis N'IMPORTE QUELLE page
 * `b2b/`, et pas seulement depuis l'écran de réception — donc depuis l'écran
 * qu'on n'ouvre pas. Avant lui, on pouvait reprendre la tarification une semaine
 * durant à côté d'une arrivée en attente sans jamais l'apercevoir.
 *
 * On passe par le DOM : tout est câblé dans le gabarit, que `tsc` ne lit pas.
 * La variante se lit sur les classes d'hôte du callout (`v-info`, `v-alert`),
 * qui sont ce que le composant expose — pas un détail deviné.
 */

function view(over: Partial<PendingDeliveryView> = {}): PendingDeliveryView {
  return {
    id: 'd_1',
    revisionId: 'rev_1',
    receivedAt: '2026-01-02T09:00:00.000Z',
    carriesAllergenChange: false,
    changes: [{ sku: 'VIE-001-1', kind: 'changed', fields: ['price'], name: 'Croissant' }],
    ...over,
  };
}

class FakeReception {
  constructor(
    private readonly value: PendingDeliveryView | null,
    private readonly fails = false,
  ) {}
  pending(): Promise<PendingDeliveryView | null> {
    return this.fails ? Promise.reject(new Error('réseau')) : Promise.resolve(this.value);
  }
}

async function render(
  reception: FakeReception,
  allowed = true,
): Promise<ComponentFixture<B2bPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [B2bPage],
    providers: [
      provideRouter([]),
      { provide: ReceptionService, useValue: reception },
      {
        provide: PermissionsStore,
        useValue: { can: () => allowed, ensureLoaded: () => Promise.resolve() },
      },
      {
        provide: WorkspaceCatalogue,
        useValue: { rail: () => signal({ title: 'B2B', icon: 'store', items: [] }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(B2bPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const callout = (fixture: ComponentFixture<B2bPage>): HTMLElement | null =>
  fixture.nativeElement.querySelector('fold-callout');

const text = (fixture: ComponentFixture<B2bPage>): string =>
  fixture.nativeElement.textContent ?? '';

describe('B2bPage — le bandeau d’arrivée', () => {
  /** L'état normal d'une plateforme à jour : rien ne doit s'afficher. */
  it('ne montre rien quand aucune arrivée n’attend', async () => {
    const fixture = await render(new FakeReception(null));

    expect(callout(fixture)).toBeNull();
  });

  it('annonce le NOMBRE de changements, et mène à la réception', async () => {
    const fixture = await render(new FakeReception(view()));

    expect(text(fixture)).toContain('1 changement');
    const link = fixture.nativeElement.querySelector('a[href="/b2b/reception"]');
    expect(link).not.toBeNull();
  });

  /** Trois changements et cent quarante n'appellent pas le même moment. */
  it('accorde le pluriel', async () => {
    const fixture = await render(
      new FakeReception(
        view({
          changes: [
            { sku: 'A', kind: 'changed', fields: ['price'], name: 'A' },
            { sku: 'B', kind: 'added', fields: [], name: 'B' },
          ],
        }),
      ),
    );

    expect(text(fixture)).toContain('2 changements');
  });

  it('reste une ligne à plat, annoncée poliment', async () => {
    const fixture = await render(new FakeReception(view()));

    expect(callout(fixture)?.classList.contains('is-flat')).toBe(true);
    expect(callout(fixture)?.getAttribute('aria-live')).toBe('polite');
  });

  /**
   * 🔴 **Une correction d'allergène ne se dit pas en bleu.** Le contrat la
   * décrit comme le seul motif qui presse — « une arrivée peut attendre
   * indéfiniment sans que rien ne casse, sauf une correction d'allergène qui
   * dormirait ». L'écran de réception l'affiche déjà en `alert` ; un bandeau
   * calme sur le chemin qui y mène contredirait la même doctrine.
   */
  it('passe en alerte quand l’arrivée touche une déclaration d’allergènes', async () => {
    const calme = await render(new FakeReception(view()));
    expect(calme.nativeElement.querySelector('fold-callout.v-info')).not.toBeNull();

    const urgent = await render(new FakeReception(view({ carriesAllergenChange: true })));
    expect(urgent.nativeElement.querySelector('fold-callout.v-alert')).not.toBeNull();
  });

  /**
   * La route de réception exige `b2b_catalog:read`. Un bandeau qui mène à un
   * 403 est pire que pas de bandeau : il nomme un geste qu'on ne peut pas faire.
   */
  it('se tait pour qui n’a pas le droit d’ouvrir la réception', async () => {
    const fixture = await render(new FakeReception(view()), false);

    expect(callout(fixture)).toBeNull();
  });

  /**
   * La chrome n'est pas l'endroit où l'on diagnostique une panne, et un bandeau
   * fantôme enverrait sur un écran vide. L'échec doit être silencieux.
   */
  it('ne montre rien — et ne casse rien — quand la lecture échoue', async () => {
    const fixture = await render(new FakeReception(null, true));

    expect(callout(fixture)).toBeNull();
  });
});
