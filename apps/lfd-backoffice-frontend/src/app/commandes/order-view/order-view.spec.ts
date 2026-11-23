import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { OrderDetailHead, OrderDocumentsList } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
} from 'fold-ng';
import type { AdminOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { adminOrder } from '../__tests__/admin-order-fixture';
import { AdminOrdersService } from '../orders.service';
import { ORDER_VIEW_TABS } from '../order-view-tabs';
import { OrderViewComponent } from './order-view';

/**
 * **Les onglets d'une commande.** Aucune carte ne disparaît : chacune a sa
 * place, « Détail » s'ouvre par défaut, et l'adresse dit l'onglet ouvert.
 */
/** L'hôte d'une page : la vue n'est jamais routée seule, une page l'encadre. */
@Component({ imports: [OrderViewComponent], template: '<app-order-view orderId="ord_9" />' })
class Host {}

/** L'hôte de la route `/commandes/:id` : la barre est à lui, la vue y accroche ses panneaux. */
@Component({
  imports: [OrderViewComponent, FoldTabsComponent],
  template: `
    <div data-band>
      <fold-tabs #bar="foldTabs" [tabs]="tabs" [activeKey]="'detail'" />
    </div>
    <app-order-view orderId="ord_9" [showHead]="false" [tabBar]="bar" />
  `,
})
class BandHost {
  protected readonly tabs = ORDER_VIEW_TABS;
}

async function open(
  url: string,
  order: AdminOrderView = adminOrder(),
  host: typeof Host | typeof BandHost = Host,
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'commandes/:orderId', component: host }]),
      { provide: AdminOrdersService, useValue: { byId: async () => order } },
    ],
  });
  // Les cartes chargent chacune leur donnée : seule leur PLACE est le sujet ici.
  TestBed.overrideComponent(OrderViewComponent, {
    set: {
      imports: [
        FoldButtonComponent,
        FoldCardComponent,
        FoldElementTitleComponent,
        FoldEmptyStateComponent,
        FoldLoadingStateComponent,
        FoldTabPanelComponent,
        FoldTabsComponent,
        OrderDetailHead,
        OrderDocumentsList,
      ],
      providers: [],
      schemas: [NO_ERRORS_SCHEMA],
    },
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await settle(harness);
  return harness;
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

const root = (h: RouterTestingHarness) => h.fixture.nativeElement as HTMLElement;
const panel = (h: RouterTestingHarness, key: string) => {
  const found = root(h).querySelector(`fold-tab-panel[data-tab="${key}"]`);
  if (found === null) {
    throw new Error(`le panneau ${key} manque`);
  }
  return found;
};

const DETAIL = [
  'lfd-order-detail',
  'lfd-order-detail app-order-placed-by[asideTop]',
  'lfd-order-detail app-order-no-show[belowComposition]',
  'lfd-order-detail app-order-shortfall-banner[belowComposition]',
  'lfd-order-detail app-order-shortfall-decision[belowComposition]',
  'lfd-order-detail app-order-shortfall-letter[belowComposition]',
  'lfd-order-detail app-order-card-increase-banner[belowComposition]',
  'lfd-order-detail app-order-refund-banner[belowComposition]',
  'lfd-order-detail app-order-refunds-card[belowComposition]',
  'lfd-order-detail app-order-item-limit-overrides-card[belowLines]',
  'lfd-order-detail app-order-budget-commitment-card[belowComposition]',
  'lfd-order-detail app-order-cancel[asideBottom]',
];
const DOCUMENTS = ['app-order-documents-panel'];
const HISTORY = ['app-order-history-card', 'app-order-revisions-card'];

describe('OrderViewComponent — les onglets', () => {
  it('🔴 une commande offerte dit son motif à l’équipe, et si le client est prévenu', async () => {
    const h = await open(
      '/commandes/ord_9',
      adminOrder({
        settlement: 'offered',
        offer: { nature: 'tasting', note: 'Dégustation du salon', notifyCustomer: false },
      }),
    );

    const offer = (h.routeNativeElement as HTMLElement).querySelector('[data-order-offer]');
    expect(offer?.textContent?.replace(/\s+/gu, ' ').trim()).toBe(
      'Commande offerte — Dégustation : Dégustation du salon. Le client n’est pas prévenu.',
    );
  });

  it('une commande payée ne montre aucun motif d’offre', async () => {
    const h = await open('/commandes/ord_9', adminOrder());

    expect((h.routeNativeElement as HTMLElement).querySelector('[data-order-offer]')).toBeNull();
  });

  it('range chaque carte dans son onglet, et nulle part ailleurs', async () => {
    const h = await open('/commandes/ord_9', adminOrder({ revision: 1 }));
    const groups: Readonly<Record<string, readonly string[]>> = {
      detail: DETAIL,
      documents: DOCUMENTS,
      history: HISTORY,
    };
    for (const [key, selectors] of Object.entries(groups)) {
      for (const selector of selectors) {
        expect(panel(h, key).querySelector(selector), `${selector} dans ${key}`).not.toBeNull();
        expect(root(h).querySelectorAll(selector), `${selector} une seule fois`).toHaveLength(1);
      }
    }
  });

  it('ouvre « Détail » par défaut, les deux autres cachés', async () => {
    const h = await open('/commandes/ord_9');
    expect(panel(h, 'detail').hasAttribute('hidden')).toBe(false);
    expect(panel(h, 'documents').hasAttribute('hidden')).toBe(true);
    expect(panel(h, 'history').hasAttribute('hidden')).toBe(true);
  });

  it('le détail partagé tait son en-tête et ses documents : ils sont ailleurs', async () => {
    const h = await open('/commandes/ord_9');
    const detail = panel(h, 'detail').querySelector('lfd-order-detail');
    expect(detail?.querySelector('lfd-order-detail-head')).toBeNull();
    // L'en-tête ouvre le corps quand aucune bande ne le porte (la fiche d'un compte).
    expect(root(h).querySelector('lfd-order-detail-head')).not.toBeNull();
  });

  it('suit l’adresse : `?onglet=historique` ouvre l’historique', async () => {
    const h = await open('/commandes/ord_9?onglet=historique');
    expect(panel(h, 'history').hasAttribute('hidden')).toBe(false);
    expect(panel(h, 'detail').hasAttribute('hidden')).toBe(true);
  });

  it('un clic sur « Documents » l’ouvre et l’écrit dans l’adresse', async () => {
    const h = await open('/commandes/ord_9');
    const tab = [...root(h).querySelectorAll<HTMLElement>('fold-tabs [role="tab"]')].find((el) =>
      (el.textContent ?? '').includes('Documents'),
    );
    tab?.click();
    await settle(h);
    expect(TestBed.inject(Router).url).toBe('/commandes/ord_9?onglet=documents');
    expect(panel(h, 'documents').hasAttribute('hidden')).toBe(false);
  });

  it('sous la fiche d’un compte, la vue porte sa propre barre', async () => {
    const h = await open('/commandes/ord_9');
    expect(root(h).querySelectorAll('fold-tabs')).toHaveLength(1);
    expect(root(h).querySelector('app-order-view fold-tabs')).not.toBeNull();
  });

  it('quand la page porte la barre, la vue n’en rend pas et y accroche ses panneaux', async () => {
    const h = await open('/commandes/ord_9', adminOrder(), BandHost);
    expect(root(h).querySelectorAll('fold-tabs')).toHaveLength(1);
    expect(root(h).querySelector('app-order-view fold-tabs')).toBeNull();
    expect(panel(h, 'detail').hasAttribute('hidden')).toBe(false);
    expect(panel(h, 'history').hasAttribute('hidden')).toBe(true);
  });

  it('passe à l’avancement qui a pris la commande', async () => {
    const h = await open('/commandes/ord_9');
    // `lfd-order-detail` est ici un élément inconnu : la liaison pose la propriété.
    const detail = panel(h, 'detail').querySelector('lfd-order-detail');
    expect(detail === null ? null : Reflect.get(detail, 'entryStep')).toEqual({
      label: 'Prise par le client',
      detail: null,
    });
  });

  it('sous la composition, les cartes du contenu, et la zone d’annulation en dernier', async () => {
    const h = await open('/commandes/ord_9');
    const detail = panel(h, 'detail').querySelector('lfd-order-detail');
    const below = [...(detail?.querySelectorAll('[belowComposition]') ?? [])].map((el) =>
      el.tagName.toLowerCase(),
    );
    expect(below).toEqual([
      'app-order-shortfall-banner',
      'app-order-shortfall-decision',
      'app-order-shortfall-letter',
      'app-order-card-increase-banner',
      'app-order-refund-banner',
      'app-order-refunds-card',
      'app-order-budget-commitment-card',
      'app-order-no-show',
    ]);
    // L'annulation n'est pas sous la composition : elle clôt le rail droit.
    expect(detail?.querySelector('app-order-cancel[asideBottom]')).not.toBeNull();
    // Rien en pleine largeur sous les trois colonnes : le panneau ne porte que le détail.
    expect(panel(h, 'detail').children).toHaveLength(1);
  });

  it('Modifier se tient hors des onglets, sous l’en-tête', async () => {
    const h = await open('/commandes/ord_9');
    const revise = root(h).querySelectorAll('app-order-revise-action');
    expect(revise).toHaveLength(1);
    expect(revise[0]?.closest('fold-tab-panel')).toBeNull();
  });

  it('quand la page porte la bande, Modifier n’est pas dans la vue', async () => {
    const h = await open('/commandes/ord_9', adminOrder(), BandHost);
    // La page porte Modifier dans sa bande : la vue, sans en-tête, n'en ajoute pas.
    expect(root(h).querySelector('app-order-view app-order-revise-action')).toBeNull();
  });

  it('demande au détail partagé ses cartes, et le badge « hors délai » des lignes passées', async () => {
    const order = adminOrder({
      itemLimitOverrides: [
        {
          sku: 'PAIN-LEV',
          staffUserId: 'stf_1',
          staffName: 'Camille',
          reason: 'Appel du client.',
          daysBefore: 2,
          time: '12:00',
          limitAt: '2026-11-22T11:00:00.000Z',
          origin: 'placement',
          recordedAt: '2026-11-20T09:00:00.000Z',
        },
      ],
    });
    const h = await open('/commandes/ord_9', order);
    const detail = panel(h, 'detail').querySelector('lfd-order-detail');
    expect(detail === null ? null : Reflect.get(detail, 'framed')).toBe(true);
    const badges: unknown = detail === null ? null : Reflect.get(detail, 'lineBadges');
    expect(badges instanceof Map ? badges.get('PAIN-LEV') : null).toBe('hors délai');
  });
});
