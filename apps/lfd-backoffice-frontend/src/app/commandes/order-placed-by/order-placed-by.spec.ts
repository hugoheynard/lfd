import { TestBed } from '@angular/core/testing';
import type { AdminOrderPlacedByView, AdminOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { adminOrder } from '../__tests__/admin-order-fixture';
import { OrderPlacedByComponent, entryStepOf, placedByLines } from './order-placed-by';

const PRO: AdminOrderPlacedByView = {
  customer: {
    userId: 'usr_1',
    firstName: 'Paul',
    lastName: 'Durand',
    email: 'chef@halles.fr',
    phone: '0611223344',
  },
  company: { id: 'cmp_1', raisonSociale: 'Café des Halles SAS', enseigne: 'Les Halles' },
  staffName: null,
};

describe('placedByLines', () => {
  it('nomme la personne et la joint — sans la société, que la bande nomme déjà', () => {
    expect(placedByLines({ placedBy: PRO })).toEqual({
      person: 'Paul Durand',
      email: 'chef@halles.fr',
      phone: '0611223344',
    });
  });

  it('sans nom, la personne se dit par son e-mail', () => {
    const anonymous = { ...PRO, customer: { ...PRO.customer, firstName: '', lastName: ' ' } };
    expect(placedByLines({ placedBy: anonymous }).person).toBe('chef@halles.fr');
  });
});

describe('entryStepOf — qui a pris la commande', () => {
  it('prise par le client quand personne de l’équipe ne l’a saisie, sans ligne en dessous', () => {
    expect(entryStepOf({ placedBy: PRO, placedByStaffId: null, entryOrigin: null })).toEqual({
      label: 'Prise par le client',
      detail: null,
    });
  });

  it("prise par l'équipe, et qui l'a saisie sur la ligne en dessous", () => {
    expect(
      entryStepOf({
        placedBy: { ...PRO, staffName: 'Hugo H' },
        placedByStaffId: 'stf_1',
        entryOrigin: null,
      }),
    ).toEqual({ label: 'Prise par l’équipe', detail: 'saisie par Hugo H' });
  });

  it("n'invente pas de nom quand l'annuaire ne le connaît plus", () => {
    expect(
      entryStepOf({ placedBy: PRO, placedByStaffId: 'stf_parti', entryOrigin: null }).detail,
    ).toBe('saisie par l’équipe');
  });

  it("dit « Prise par l'équipe » pour le commercial, et garde le comptoir", () => {
    const staff = { placedBy: { ...PRO, staffName: 'Hugo H' }, placedByStaffId: 'stf_1' };
    expect(entryStepOf({ ...staff, entryOrigin: 'counter' }).label).toBe('Prise au comptoir');
    expect(entryStepOf({ ...staff, entryOrigin: 'commercial' }).label).toBe('Prise par l’équipe');
  });
});

describe('OrderPlacedByComponent — la carte Contact', () => {
  function render(order: AdminOrderView): HTMLElement {
    const fixture = TestBed.createComponent(OrderPlacedByComponent);
    fixture.componentRef.setInput('order', order);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('est une carte fold « Contact » qui nomme la personne en clair', () => {
    const el = render(adminOrder());
    // L'intitulé de « Avancement » et « Montants » : le même composant partagé.
    expect(el.querySelector('fold-card[data-placed-by] lfd-section-title')).not.toBeNull();
    expect(el.textContent).toContain('Contact');
    expect(el.querySelector('[data-placed-by-person]')?.textContent).toContain('Paul Durand');
  });

  it("rend l'e-mail et le téléphone en liens actifs, chacun avec son icône", () => {
    const el = render(adminOrder({ placedBy: PRO }));
    expect(el.querySelector('[data-placed-by-email] a')?.getAttribute('href')).toBe(
      'mailto:chef@halles.fr',
    );
    expect(el.querySelector('[data-placed-by-phone] a')?.getAttribute('href')).toBe(
      'tel:0611223344',
    );
    expect(el.querySelector('[data-placed-by-email] fold-icon')).not.toBeNull();
    expect(el.querySelector('[data-placed-by-phone] fold-icon')).not.toBeNull();
  });

  it('ne dit ni la société ni qui a pris la commande', () => {
    const el = render(
      adminOrder({ placedBy: { ...PRO, staffName: 'Hugo H' }, placedByStaffId: 'stf_1' }),
    );
    expect(el.textContent).not.toContain('Les Halles');
    expect(el.textContent).not.toContain('saisie par');
    expect(el.textContent).not.toContain('Prise par');
  });

  it('ne dit rien du téléphone quand il manque', () => {
    const el = render(
      adminOrder({ placedBy: { ...PRO, customer: { ...PRO.customer, phone: null } } }),
    );
    expect(el.querySelector('[data-placed-by-phone]')).toBeNull();
  });
});
