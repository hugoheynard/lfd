import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DeliveryRoundDriverView } from '@lfd/contracts';
import { FoldDropdownItemComponent } from 'fold-ng';
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
    const option = fixture.debugElement.query(By.css('[data-driver-option]'));
    // La vraie entrée de menu fold : c'est son événement qui est piloté.
    expect(option.componentInstance).toBeInstanceOf(FoldDropdownItemComponent);
    option.triggerEventHandler('selected');
    expect(emitted).toEqual([]);
  });

  it('sans livreur, le bouton menu invite à en choisir un ; le menu affecte', () => {
    const { fixture, element, emitted } = mount(null);
    expect(element.querySelector('[data-driver-choice]')?.classList).toContain('missing');
    expect(element.querySelector('[data-driver-name]')?.textContent).toContain(
      'Choisir un livreur',
    );
    expect(element.querySelector('[data-driver-remove]')).toBeNull();
    fixture.debugElement.query(By.css('[data-driver-option]')).triggerEventHandler('selected');
    expect(emitted).toEqual(['u-1']);
  });

  it('« Retirer le livreur » est dans le menu quand un livreur est affecté', () => {
    const { fixture } = mount({ staffUserId: 'u-2', name: 'Zoé', canDrive: true });
    let removed = 0;
    fixture.componentInstance.unassigned.subscribe(() => (removed += 1));
    fixture.debugElement.query(By.css('[data-driver-remove]')).triggerEventHandler('selected');
    expect(removed).toBe(1);
  });

  it('en lecture seule, ni choix ni retrait', () => {
    const { element } = mount({ staffUserId: 'u-1', name: 'Paul', canDrive: true }, false);
    expect(element.querySelector('[data-driver-choice]')).toBeNull();
    expect(element.querySelector('[data-driver-remove]')).toBeNull();
  });
});
