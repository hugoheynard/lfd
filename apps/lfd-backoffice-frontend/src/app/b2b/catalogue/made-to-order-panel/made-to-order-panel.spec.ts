import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ArticleReservationView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MadeToOrderService } from '../made-to-order.service';
import { MadeToOrderPanel } from './made-to-order-panel';

/** Le panneau du sur mesure (plan des articles sur mesure, L1a). */

class FakeMadeToOrder {
  view: ArticleReservationView = {
    sku: 'TAR-001-1',
    name: 'Tarte citron',
    isMadeToOrder: false,
    reservedVisibility: 'hidden',
    holders: [
      {
        companyId: 'co_1',
        companyName: 'Le Fournil d’Anna',
        // Affiché seulement, comparé à aucune horloge.
        reservedAt: '2026-01-15T10:00:00.000Z',
        reservedByName: null,
      },
    ],
  };
  readonly sent: string[] = [];

  ofArticle(): Promise<ArticleReservationView> {
    return Promise.resolve(this.view);
  }

  setMadeToOrder(_sku: string, madeToOrder: boolean): Promise<void> {
    this.sent.push(`made-to-order:${madeToOrder}`);
    this.view = { ...this.view, isMadeToOrder: madeToOrder };
    return Promise.resolve();
  }

  setReservedVisibility(_sku: string, visibility: string): Promise<void> {
    this.sent.push(`visibility:${visibility}`);
    return Promise.resolve();
  }
}

async function render(api: FakeMadeToOrder, closes: unknown[] = []) {
  TestBed.configureTestingModule({
    imports: [MadeToOrderPanel],
    providers: [
      provideRouter([]),
      { provide: MadeToOrderService, useValue: api },
      { provide: PermissionsStore, useValue: { can: () => true } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closes.push(result)) },
    ],
  });
  const fixture: ComponentFixture<MadeToOrderPanel> = TestBed.createComponent(MadeToOrderPanel);
  fixture.componentRef.setInput('data', { sku: 'TAR-001-1', name: 'Tarte citron' });
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<MadeToOrderPanel>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('MadeToOrderPanel', () => {
  it('nomme les comptes réservataires, sans plus annoncer un mur à venir', async () => {
    const fixture = await render(new FakeMadeToOrder());

    expect(text(fixture)).toContain('Réservé à 1 compte');
    expect(text(fixture)).toContain('Le Fournil d’Anna');
    // Le mur est bâti (L1b, 2026-10-30) : l'annonce d'attente est partie.
    expect(text(fixture)).not.toContain('prochain déploiement');
  });

  it('cocher « sur mesure » n’envoie rien avant Enregistrer, puis seulement le marqueur', async () => {
    const api = new FakeMadeToOrder();
    const closes: unknown[] = [];
    const fixture = await render(api, closes);
    const root = fixture.nativeElement as HTMLElement;

    const save = (): HTMLButtonElement | undefined =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Enregistrer');
    expect(save()?.disabled).toBe(true);

    root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    await settle(fixture);
    expect(api.sent).toEqual([]);
    expect(save()?.disabled).toBe(false);

    save()?.click();
    await settle(fixture);

    expect(api.sent).toEqual(['made-to-order:true']);
    expect(closes).toEqual([true]);
  });

  it('Annuler avec des changements demande, et Abandonner n’envoie rien', async () => {
    const api = new FakeMadeToOrder();
    const closes: unknown[] = [];
    const fixture = await render(api, closes);
    const root = fixture.nativeElement as HTMLElement;
    const button = (label: string): HTMLButtonElement | undefined =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

    root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    await settle(fixture);
    button('Annuler')?.click();
    await settle(fixture);

    expect(closes).toEqual([]);
    expect(text(fixture)).toContain('Des modifications ne sont pas enregistrées');

    button('Abandonner')?.click();
    await settle(fixture);
    expect(api.sent).toEqual([]);
    expect(closes).toEqual([undefined]);
  });

  it('un échec garde la saisie, et réessayer ne renvoie que le reste', async () => {
    const api = new FakeMadeToOrder();
    let failMark = true;
    const mark = api.setMadeToOrder.bind(api);
    api.setMadeToOrder = (sku, value) =>
      failMark ? Promise.reject(new Error('panne')) : mark(sku, value);
    const closes: unknown[] = [];
    const fixture = await render(api, closes);
    const root = fixture.nativeElement as HTMLElement;
    const button = (label: string): HTMLButtonElement | undefined =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

    root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Visible, non commandable')
      ?.click();
    await settle(fixture);
    button('Enregistrer')?.click();
    await settle(fixture);

    expect(api.sent).toEqual(['visibility:visible_locked']);
    expect(text(fixture)).toContain("n'a pas pu être enregistré");
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(closes).toEqual([]);

    failMark = false;
    button('Enregistrer')?.click();
    await settle(fixture);
    expect(api.sent).toEqual(['visibility:visible_locked', 'made-to-order:true']);
    expect(closes).toEqual([true]);
  });
});

async function settle(fixture: ComponentFixture<MadeToOrderPanel>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}
