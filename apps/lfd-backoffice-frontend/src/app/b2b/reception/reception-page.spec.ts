import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { PendingDeliveryView } from '@lfd/contracts';
import { NotifyService } from '../../notify.service';
import { ReceptionPage } from './reception-page';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ReceivedOperationsService } from './received-operations.service';
import { ReceptionService } from './reception.service';

/**
 * Ce que ces cas tiennent : **ce que l'opérateur décide arrive au serveur**, et
 * le libellé qui change de sens sur un retrait.
 *
 * On passe par le DOM plutôt que par l'instance : les membres sont `protected`,
 * et c'est le gabarit qui câble les cases — que `tsc` ne lit pas.
 */

function view(over: Partial<PendingDeliveryView> = {}): PendingDeliveryView {
  return {
    id: 'd_1',
    revisionId: 'rev_1',
    receivedAt: '2026-01-02T09:00:00.000Z',
    carriesAllergenChange: false,
    carriesPublicVatChange: false,
    changes: [
      { sku: 'VIE-001-1', kind: 'changed', fields: ['price'], name: 'Croissant' },
      { sku: 'PAT-002-1', kind: 'removed', fields: [], name: 'Pain au chocolat' },
    ],
    ...over,
  };
}

class FakeReception {
  pendingValue: PendingDeliveryView | null = view();
  readonly accepted: { id: string; excluded: readonly string[] }[] = [];
  rejectAccept: Error | null = null;

  pending(): Promise<PendingDeliveryView | null> {
    return Promise.resolve(this.pendingValue);
  }
  accept(id: string, excluded: readonly string[]): Promise<void> {
    this.accepted.push({ id, excluded });
    return this.rejectAccept === null ? Promise.resolve() : Promise.reject(this.rejectAccept);
  }
}

class FakeNotify {
  readonly errors: unknown[] = [];
  readonly successes: string[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
  error(error: unknown): void {
    this.errors.push(error);
  }
}

async function render(api: FakeReception, notify = new FakeNotify()) {
  TestBed.configureTestingModule({
    imports: [ReceptionPage],
    providers: [
      { provide: ReceptionService, useValue: api },
      { provide: NotifyService, useValue: notify },
      // Les opérations reçues ont leur propre spec : ici, rien de reçu.
      { provide: ReceivedOperationsService, useValue: { list: async () => [] } },
      { provide: CatalogueService, useValue: { list: async () => [] } },
    ],
  });
  const fixture: ComponentFixture<ReceptionPage> = TestBed.createComponent(ReceptionPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, notify };
}

const text = (fixture: ComponentFixture<ReceptionPage>): string =>
  fixture.nativeElement.textContent ?? '';

function checkboxNamed(fixture: ComponentFixture<ReceptionPage>, label: string): HTMLInputElement {
  const found = [...fixture.nativeElement.querySelectorAll('label')].find(
    (node): node is HTMLLabelElement =>
      node instanceof HTMLLabelElement && (node.textContent ?? '').includes(label),
  );
  const input = found?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Case « ${label} » introuvable.`);
  }
  return input;
}

async function click(fixture: ComponentFixture<ReceptionPage>, label: string): Promise<void> {
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement && (node.textContent ?? '').includes(label),
  );
  button?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ReceptionPage', () => {
  it('valide sans rien écarter quand on ne touche à rien', async () => {
    const api = new FakeReception();
    const { fixture } = await render(api);

    await click(fixture, 'Valider');

    expect(api.accepted).toEqual([{ id: 'd_1', excluded: [] }]);
  });

  it('transmet les SKU écartés, et eux seuls', async () => {
    const api = new FakeReception();
    const { fixture } = await render(api);

    checkboxNamed(fixture, 'Écarter ce changement').click();
    fixture.detectChanges();
    await click(fixture, 'Valider');

    expect(api.accepted).toEqual([{ id: 'd_1', excluded: ['VIE-001-1'] }]);
  });

  /**
   * 🔴 Écarter une SORTIE, c'est GARDER l'article. Un libellé unique aurait
   * laissé l'opérateur deviner, sur le geste où il tient le plus à décider.
   */
  it('dit « garder » sur un retrait, « écarter » sur un changement', async () => {
    const { fixture } = await render(new FakeReception());

    expect(text(fixture)).toContain('Garder cet article');
    expect(text(fixture)).toContain('Écarter ce changement');
  });

  /**
   * Le seul motif qui presse. Une arrivée peut attendre indéfiniment sans que
   * rien ne casse — sauf une correction d'allergène qui dormirait. Une bannière
   * qui sonnerait aussi pour un prix cesserait d'être lue avant celle-ci, d'où
   * les deux cas : elle apparaît, et elle SE TAIT.
   */
  it('alerte quand une déclaration d’allergènes bouge', async () => {
    const api = new FakeReception();
    api.pendingValue = view({ carriesAllergenChange: true });

    const { fixture } = await render(api);

    expect(text(fixture)).toContain("déclaration d'allergènes");
  });

  it('se tait sur une arrivée de prix et de textes', async () => {
    const { fixture } = await render(new FakeReception());

    expect(text(fixture)).not.toContain("déclaration d'allergènes");
  });

  /**
   * 🔴 **Le second motif, ajouté le 2026-09-21.**
   *
   * Le gabarit portait « c'est le SEUL motif qui presse » et « une bannière qui
   * sonnerait pour un PRIX cesserait d'être lue ». La règle est gardée — un
   * prix qui bouge est l'ordinaire du référentiel, il ne sonne pas.
   *
   * Un TAUX n'est pas un prix : il change rarement, il est imposé du dehors, et
   * tant qu'il dort chaque vente publique part au mauvais taux.
   */
  it('🔴 alerte quand un TAUX DE TVA PUBLIC bouge', async () => {
    const api = new FakeReception();
    api.pendingValue = view({ carriesPublicVatChange: true });

    const { fixture } = await render(api);

    expect(text(fixture)).toContain('taux de TVA public');
  });

  it('ne sonne pas pour un prix qui bouge — la règle du gabarit est gardée', async () => {
    const { fixture } = await render(new FakeReception());

    expect(text(fixture)).not.toContain('taux de TVA public');
  });

  /** Rien à valider est l'état NORMAL : un vide serein, pas une panne. */
  it('affiche un vide serein quand rien n’attend', async () => {
    const api = new FakeReception();
    api.pendingValue = null;

    const { fixture } = await render(api);

    expect(text(fixture)).toContain('Rien à valider');
  });

  /**
   * Un refus vient presque toujours d'une arrivée remplacée. Recharger remet
   * l'écran sur ce qui attend VRAIMENT, au lieu de laisser réessayer sur une
   * arrivée qui n'existe plus.
   */
  it('signale le refus et recharge, plutôt que de laisser réessayer à vide', async () => {
    const api = new FakeReception();
    api.rejectAccept = new Error('remplacée');
    const { fixture, notify } = await render(api);

    api.pendingValue = null;
    await click(fixture, 'Valider');

    expect(notify.errors).toHaveLength(1);
    expect(text(fixture)).toContain('Rien à valider');
  });
});
