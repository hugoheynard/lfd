import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LIVE_PICKUP } from '../order-view.fixture';
import { rowCopyOf, trackedOf, type TrackedOrder } from '../order-rows';
import { LiveOrdersWell } from './live-orders-well';

const COPY = rowCopyOf({
  modePickup: 'Retrait',
  modeDelivery: 'Livraison',
  stepPlaced: 'Panier validé',
  stepBakery: 'Au fournil',
  stepReady: 'Prête',
  stepHandedPickup: 'Retirée',
  stepHandedDelivery: 'Livrée',
  qrReady: 'Votre QR est prêt',
  noWindow: '',
});

const ONE: TrackedOrder = trackedOf(LIVE_PICKUP, COPY);
const TWO: TrackedOrder = trackedOf({ ...LIVE_PICKUP, orderNumber: 'CMD-0010' }, COPY);

function boot(orders: readonly TrackedOrder[]): ComponentFixture<LiveOrdersWell> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [LiveOrdersWell] });
  const fixture = TestBed.createComponent(LiveOrdersWell);
  fixture.componentRef.setInput('orders', orders);
  fixture.componentRef.setInput('title', 'Mes suivis');
  fixture.componentRef.setInput('subtitle', '2 en cours');
  fixture.componentRef.setInput('allLabel', 'Toutes mes commandes');
  fixture.componentRef.setInput('dotLabel', 'Aller au suivi {n}');
  fixture.detectChanges();
  return fixture;
}

describe('LiveOrdersWell', () => {
  it('rend une carte par commande suivie', () => {
    const band = boot([ONE, TWO]).nativeElement as HTMLElement;

    expect(band.querySelectorAll('app-track-card')).toHaveLength(2);
    expect(band.textContent).toContain('Mes suivis');
  });

  /**
   * 🔴 RÉGRESSION — la sortie vers l'historique était AVALÉE EN SILENCE.
   *
   * `fold-well` re-projette `[titleAction]` dans `fold-element-title`, et
   * Angular apparie un slot enfant sur l'élément `<ng-content>` lui-même, pas
   * sur ce qui le traverse : sans `ngProjectAs`, le bouton tombait dans un slot
   * par défaut qui n'existe pas. Aucune erreur, aucun avertissement, rien dans
   * le DOM — et personne ne l'avait vu parce que tous les autres `titleAction`
   * du dépôt sont écrits directement sur un `fold-element-title`.
   */
  it('projette VRAIMENT la sortie vers l’historique dans la tête', () => {
    const band = boot([ONE]).nativeElement as HTMLElement;
    const sortie = band.querySelector('button.all');

    expect(sortie).not.toBeNull();
    expect(sortie?.textContent?.trim()).toBe('Toutes mes commandes');
  });

  it('émet plutôt que de naviguer — l’écran sait où mènent le QR et l’historique', () => {
    const fixture = boot([ONE]);
    const dits: string[] = [];
    fixture.componentInstance.allAsked.subscribe(() => dits.push('historique'));
    fixture.componentInstance.qrAsked.subscribe((id) => dits.push(id));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.all')?.click();

    expect(dits).toEqual(['historique']);
  });
});
