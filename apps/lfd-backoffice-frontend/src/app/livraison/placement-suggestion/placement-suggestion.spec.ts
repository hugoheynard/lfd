import { TestBed } from '@angular/core/testing';
import type { DeliveryPlacementSuggestionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PlacementSuggestion } from './placement-suggestion';

const SUGGESTED: DeliveryPlacementSuggestionView = {
  orderId: 'o_1',
  reference: 'CMD-1',
  status: 'suggested',
  roundId: 'r_1',
  roundVersion: 3,
  vehicleId: 'v_2',
  vehicleName: 'Camionnette 2',
  passage: 1,
  after: 4,
  stopCount: 7,
  extraMinutes: 6,
};

function mount(suggestion: DeliveryPlacementSuggestionView, canPlace: boolean) {
  const fixture = TestBed.createComponent(PlacementSuggestion);
  fixture.componentRef.setInput('suggestion', suggestion);
  fixture.componentRef.setInput('canPlace', canPlace);
  let placed = 0;
  fixture.componentInstance.place.subscribe(() => (placed += 1));
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, placed: () => placed };
}

describe('PlacementSuggestion (CA7)', () => {
  it('dit la place et remonte « Placer ici »', () => {
    const { element, placed } = mount(SUGGESTED, true);

    expect(element.querySelector('[data-suggestion-words]')?.textContent).toContain(
      'Camionnette 2, entre l’arrêt 4 et 5 (+6 min',
    );
    element.querySelector<HTMLButtonElement>('[data-place-here]')?.click();
    expect(placed()).toBe(1);
  });

  it('sans droit d’écrire, ou pendant une écriture, la place se lit sans bouton', () => {
    const { element } = mount(SUGGESTED, false);

    expect(element.querySelector('[data-suggestion-words]')).not.toBeNull();
    expect(element.querySelector('[data-place-here]')).toBeNull();
  });

  it('sans place, la raison seule', () => {
    const { element } = mount(
      { orderId: 'o_1', reference: 'CMD-1', status: 'none', reason: 'deadline' },
      true,
    );

    expect(element.textContent).toContain('elle manquerait son échéance');
    expect(element.querySelector('[data-place-here]')).toBeNull();
  });
});
