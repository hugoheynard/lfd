import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyReservedArticlesView, ReservedArticleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { MadeToOrderService } from '../../b2b/catalogue/made-to-order.service';
import { NotifyService } from '../../notify.service';
import { ClientReservedArticlesPage } from './reserved-articles-page';

/**
 * L'onglet « Articles réservés » (plan des articles sur mesure, L1a) : les
 * siens, ceux du principal en lecture seule, le geste de retrait, et l'aveu
 * que le mur n'est pas encore en place.
 */

/** Un instant quelconque : il n'est comparé à aucune horloge, seulement affiché. */
const RESERVED_AT = '2026-01-15T10:00:00.000Z';

function article(over: Partial<ReservedArticleView> = {}): ReservedArticleView {
  return {
    sku: 'TAR-001-1',
    name: 'Tarte citron',
    isMadeToOrder: true,
    reservedVisibility: 'hidden',
    reservedAt: RESERVED_AT,
    reservedByName: 'Colette Martin',
    ...over,
  };
}

class FakeMadeToOrder {
  view: CompanyReservedArticlesView = { own: [article()], principal: null };
  readonly released: string[] = [];

  ofCompany(): Promise<CompanyReservedArticlesView> {
    return Promise.resolve(this.view);
  }

  release(sku: string, companyId: string): Promise<void> {
    this.released.push(`${sku}|${companyId}`);
    this.view = { ...this.view, own: [] };
    return Promise.resolve();
  }
}

async function render(api: FakeMadeToOrder, canWrite: boolean) {
  TestBed.configureTestingModule({
    imports: [ClientReservedArticlesPage],
    providers: [
      { provide: MadeToOrderService, useValue: api },
      { provide: CatalogueService, useValue: { list: () => Promise.resolve([]) } },
      { provide: PermissionsStore, useValue: { can: () => canWrite } },
      {
        provide: NotifyService,
        useValue: { success: () => undefined, error: () => undefined },
      },
    ],
  });
  const fixture: ComponentFixture<ClientReservedArticlesPage> = TestBed.createComponent(
    ClientReservedArticlesPage,
  );
  fixture.componentRef.setInput('id', 'co_1');
  fixture.detectChanges();
  // La lecture part d'un effet : on laisse ses promesses se résoudre.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<ClientReservedArticlesPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('ClientReservedArticlesPage', () => {
  it('liste les articles du compte, sans plus annoncer un mur à venir', async () => {
    const fixture = await render(new FakeMadeToOrder(), true);

    expect(text(fixture)).toContain('Tarte citron');
    expect(text(fixture)).toContain('Invisible aux autres pros');
    // Le mur est bâti (L1b, 2026-10-30) : l'annonce d'attente est partie.
    expect(text(fixture)).not.toContain('prochain déploiement');
  });

  it('montre les articles du principal en lecture seule, et son état', async () => {
    const api = new FakeMadeToOrder();
    api.view = {
      own: [],
      principal: {
        companyId: 'co_mere',
        name: 'Maison mère',
        active: false,
        articles: [article({ sku: 'PAIN-1', name: 'Pain du chef' })],
      },
    };

    const fixture = await render(api, true);

    expect(text(fixture)).toContain('Hérités de Maison mère');
    expect(text(fixture)).toContain('Pain du chef');
    expect(text(fixture)).toContain("n'est pas actif");
  });

  it('sans droit d’écriture, ni ajout ni retrait', async () => {
    const fixture = await render(new FakeMadeToOrder(), false);

    expect(text(fixture)).toContain('Tarte citron');
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-combobox')).toBeNull();
    expect(text(fixture)).not.toContain('Retirer');
  });
});
