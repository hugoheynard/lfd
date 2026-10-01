import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DeliveryRoundDriverView } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { driverLabelOf, RoundDriver } from './round-driver';

function mount(driver: DeliveryRoundDriverView | null, editable = true) {
  const fixture = TestBed.createComponent(RoundDriver);
  fixture.componentRef.setInput('driver', driver);
  fixture.componentRef.setInput('drivers', [{ value: 'u-1', label: 'Paul Livreur' }]);
  fixture.componentRef.setInput('editable', editable);
  fixture.detectChanges();
  const emitted: string[] = [];
  fixture.componentInstance.assigned.subscribe((id) => emitted.push(id));
  return { fixture, element: fixture.nativeElement as HTMLElement, emitted };
}

describe('driverLabelOf', () => {
  it('nomme le livreur, dit son absence, et une fiche disparue', () => {
    expect(driverLabelOf(null)).toBe('Aucun livreur');
    expect(driverLabelOf({ staffUserId: 'u-1', name: 'Paul', canDrive: true })).toBe('Paul');
    expect(driverLabelOf({ staffUserId: 'u-1', name: null, canDrive: true })).toBe(
      'Livreur sans fiche dans l’annuaire',
    );
  });
});

describe('RoundDriver', () => {
  it('ne réaffecte pas celui qui l’est déjà', () => {
    const { fixture, emitted } = mount({ staffUserId: 'u-1', name: 'Paul', canDrive: true });
    const listbox = fixture.debugElement.query(By.css('[data-driver-choice]'));
    expect(listbox.componentInstance).toBeInstanceOf(FoldListboxComponent);
    listbox.triggerEventHandler('selectionChange', 'u-1');
    listbox.triggerEventHandler('selectionChange', 'u-2');
    expect(emitted).toEqual(['u-2']);
  });

  it('en lecture seule, ni choix ni retrait', () => {
    const { element } = mount({ staffUserId: 'u-1', name: 'Paul', canDrive: true }, false);
    expect(element.querySelector('[data-driver-choice]')).toBeNull();
    expect(element.querySelector('[data-driver-remove]')).toBeNull();
  });
});
