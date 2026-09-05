import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { OrderContextBar } from './order-context-bar';
import { OrderContextStore, type ServiceChoice } from '../../../order-context.store';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  discount: 10,
  fee: 0,
  slot: '7 h – 8 h',
};

describe('OrderContextBar', () => {
  let fixture: ComponentFixture<OrderContextBar>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  let store: OrderContextStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OrderContextBar] });
    store = TestBed.inject(OrderContextStore);
    fixture = TestBed.createComponent(OrderContextBar);
  });

  it('rappelle le lieu et le créneau quand le service est pris', () => {
    store.choice.set(AU_LABO);
    fixture.detectChanges();

    expect(text()).toContain('Le Labo');
    expect(text()).toContain('7 h – 8 h');
    expect(el().querySelector('.ask')).toBeNull();
  });

  /**
   * Visiter d'abord, choisir ensuite : sans service, la barre DEMANDE au lieu de
   * rappeler. Elle ne disparaît pas — la place est la même, et c'est ce qui fait
   * qu'une seule question est posée à un seul endroit.
   */
  it('demande le mode quand aucun n’est pris, au lieu de s’effacer', () => {
    store.choice.set(null);
    fixture.detectChanges();

    expect(el().querySelector('.bar.ask')).not.toBeNull();
    expect(el().querySelector('.badge')).toBeNull();
  });

  it('signale la demande de changement sans naviguer elle-même', () => {
    store.choice.set(AU_LABO);
    let asked = 0;
    fixture.componentInstance.changeRequested.subscribe(() => (asked += 1));
    fixture.detectChanges();

    el().querySelector('button')?.click();

    expect(asked).toBe(1);
  });

  /** Le même geste dans les deux états : c'est la même question qu'on rouvre. */
  it('signale aussi depuis l’invite', () => {
    store.choice.set(null);
    let asked = 0;
    fixture.componentInstance.changeRequested.subscribe(() => (asked += 1));
    fixture.detectChanges();

    el().querySelector('button')?.click();

    expect(asked).toBe(1);
  });
});
