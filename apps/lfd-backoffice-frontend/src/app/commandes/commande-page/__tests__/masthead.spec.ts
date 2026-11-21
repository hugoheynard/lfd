import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  FoldBackLinkComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldTabsComponent,
} from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { adminOrder } from '../../__tests__/admin-order-fixture';
import { OrderMasthead } from '../../order-masthead/order-masthead';
import { AdminCommandePage } from '../commande-page';

/**
 * **La bande de tête de la page** : le retour, puis l'en-tête staff. Le corps
 * (`app-order-view`) n'est pas le sujet ici ; l'en-tête a sa propre spec.
 */
function render(): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  TestBed.overrideComponent(AdminCommandePage, {
    set: {
      imports: [
        FoldBackLinkComponent,
        FoldPageLayoutComponent,
        FoldPageSectionComponent,
        FoldSurfaceDirective,
        FoldTabsComponent,
        OrderMasthead,
      ],
      schemas: [NO_ERRORS_SCHEMA],
    },
  });
  const fixture = TestBed.createComponent(AdminCommandePage);
  fixture.componentRef.setInput('orderId', 'ord_9');
  fixture.componentInstance['onLoaded'](adminOrder());
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AdminCommandePage — la bande de tête', () => {
  it('porte le retour « Toutes les commandes », puis l’en-tête staff', () => {
    const band = render().querySelector('[data-masthead]');
    expect(band?.querySelector('fold-back-link[data-back]')?.textContent).toContain(
      'Toutes les commandes',
    );
    expect(band?.querySelector('app-order-masthead [data-om-number]')?.textContent).toContain(
      'ORD-9',
    );
  });

  it('porte « Modifier » dans la bande, à la suite du montant', () => {
    const top = render().querySelector('[data-masthead] [data-om-line="identity"]');
    // Un seul bloc à droite, le montant puis « Modifier » : ils passent à la ligne ensemble.
    const end = top?.lastElementChild;
    expect(end?.matches('[data-om-end]')).toBe(true);
    expect(end?.querySelector(':scope > [data-om-total] + app-order-revise-action')).not.toBeNull();
  });

  it('ne dit le numéro qu’une fois dans la bande', () => {
    const band = render().querySelector('[data-masthead]');
    expect((band?.textContent ?? '').match(/ORD-9/gu)).toHaveLength(1);
  });

  it('porte la barre d’onglets en dernier, en classeur, et la seule de la page', () => {
    const el = render();
    const stack = el.querySelector('[data-masthead] .cp-masthead-stack');
    expect(stack?.lastElementChild?.matches('fold-tabs[data-order-tabs]')).toBe(true);
    expect(el.querySelectorAll('fold-tabs')).toHaveLength(1);
    const labels = [...el.querySelectorAll('fold-tabs [role="tab"]')].map((tab) =>
      (tab.textContent ?? '').trim(),
    );
    expect(labels).toEqual(['Détail', 'Documents', 'Historique']);
  });

  it('laisse le corps sous la bande, hors d’elle', () => {
    const el = render();
    expect(el.querySelector('[data-masthead] app-order-view')).toBeNull();
    expect(el.querySelector('app-order-view')).not.toBeNull();
  });
});
