import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import type { HistoryOrder } from '../../mock-orders';
import { MOCK_HISTORY } from '../../mock-orders';
import { HistoryTable } from './history-table';

describe('HistoryTable', () => {
  let fixture: ComponentFixture<HistoryTable>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  // Le châssis appartient au système : on vise SES sélecteurs, pas les nôtres.
  const toggles = (): HTMLButtonElement[] =>
    Array.from(el().querySelectorAll('button.folddt-expand'));
  const drawers = (): HTMLElement[] => Array.from(el().querySelectorAll('.folddt-detail'));
  const stars = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('button.star'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HistoryTable] });
    fixture = TestBed.createComponent(HistoryTable);
    fixture.componentRef.setInput('orders', MOCK_HISTORY);
    fixture.detectChanges();
  });

  it('donne une ligne par commande, et n’en déplie aucune au départ', () => {
    expect(toggles().length).toBe(MOCK_HISTORY.length);
    expect(drawers().length).toBe(0);
  });

  it('n’annonce l’origine que lorsqu’elle n’est PAS l’app', () => {
    // L'écrire partout ferait disparaître les deux qui comptent.
    const origins = Array.from(el().querySelectorAll('.origin')).map((n) => n.textContent?.trim());
    expect(origins).toEqual(['Panier récurrent', 'Téléphone']);
  });

  it('déplie DANS la liste, et une seule à la fois', () => {
    toggles()[0]?.click();
    fixture.detectChanges();
    expect(drawers().length).toBe(1);

    toggles()[1]?.click();
    fixture.detectChanges();
    // La deuxième remplace la première : deux tiroirs ouverts chassent le reste
    // de la liste hors de l'écran, et on est venu comparer.
    expect(drawers().length).toBe(1);
    expect(drawers()[0]?.textContent).toContain(MOCK_HISTORY[1]?.slot ?? '');
  });

  it('le règlement dit aussi OÙ il tombe', () => {
    toggles()[0]?.click();
    fixture.detectChanges();
    expect(drawers()[0]?.textContent).toContain(FR.orders.payAccountNote);
  });

  it('la note RÉPOND au geste, et différemment selon le geste', () => {
    toggles()[0]?.click();
    fixture.detectChanges();
    expect(el().querySelector('.rate-label')?.textContent).toContain(FR.orders.rateIdle);

    stars()[1]?.click();
    fixture.detectChanges();
    expect(el().querySelector('.rate-label')?.textContent).toContain(FR.orders.rateLow);

    stars()[4]?.click();
    fixture.detectChanges();
    expect(el().querySelector('.rate-label')?.textContent).toContain(FR.orders.rateHigh);
  });

  it('remonte le signalement plutôt que de l’ouvrir lui-même', () => {
    // Deux surfaces l'accueillent — feuille montante et tiroir : la table n'a
    // pas à savoir laquelle, sans quoi elles partageraient un état d'ouverture.
    const raised: HistoryOrder[] = [];
    fixture.componentInstance.problemRaised.subscribe((order) => raised.push(order));
    toggles()[0]?.click();
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.act--danger')?.click();
    expect(raised.map((o) => o.reference)).toEqual([MOCK_HISTORY[0]?.reference]);
  });

  it('parle la langue de l’app jusque dans le châssis', () => {
    // Les libellés du tiroir viennent de fold, en anglais par défaut : sans les
    // passer, un lecteur d'écran français entendrait « Show details ».
    expect(toggles()[0]?.getAttribute('aria-label')).toBe(FR.orders.expand);
  });
});
