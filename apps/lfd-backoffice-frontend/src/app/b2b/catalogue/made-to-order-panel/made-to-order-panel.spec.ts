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
  readonly marked: boolean[] = [];

  ofArticle(): Promise<ArticleReservationView> {
    return Promise.resolve(this.view);
  }

  setMadeToOrder(_sku: string, madeToOrder: boolean): Promise<void> {
    this.marked.push(madeToOrder);
    this.view = { ...this.view, isMadeToOrder: madeToOrder };
    return Promise.resolve();
  }
}

async function render(api: FakeMadeToOrder) {
  TestBed.configureTestingModule({
    imports: [MadeToOrderPanel],
    providers: [
      provideRouter([]),
      { provide: MadeToOrderService, useValue: api },
      { provide: PermissionsStore, useValue: { can: () => true } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
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
  it('nomme les comptes réservataires, et dit que le mur n’est pas encore là', async () => {
    const fixture = await render(new FakeMadeToOrder());

    expect(text(fixture)).toContain('Réservé à 1 compte');
    expect(text(fixture)).toContain('Le Fournil d’Anna');
    expect(text(fixture)).toContain('La restriction s’appliquera avec le prochain déploiement');
  });

  it('cocher « sur mesure » envoie le geste', async () => {
    const api = new FakeMadeToOrder();
    const fixture = await render(api);

    const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    box?.click();
    await new Promise((resolve) => setTimeout(resolve));

    expect(api.marked).toEqual([true]);
  });
});
