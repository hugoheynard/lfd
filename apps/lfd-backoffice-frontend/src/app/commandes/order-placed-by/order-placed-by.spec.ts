import { TestBed } from '@angular/core/testing';
import type { AdminOrderPlacedByView, AdminOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderPlacedByComponent, placedByLines } from './order-placed-by';

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
  it('nomme la personne, la joint, et dit la société sous ses deux noms', () => {
    expect(placedByLines({ placedBy: PRO, placedByStaffId: null })).toEqual({
      person: 'Paul Durand',
      email: 'chef@halles.fr',
      phone: '0611223344',
      company: 'Les Halles (Café des Halles SAS)',
      onBehalf: null,
    });
  });

  it('sans enseigne, la raison sociale seule ; sans société, rien', () => {
    const noSign = {
      ...PRO,
      company: { id: 'cmp_1', raisonSociale: 'Café des Halles SAS', enseigne: null },
    };
    expect(placedByLines({ placedBy: noSign, placedByStaffId: null }).company).toBe(
      'Café des Halles SAS',
    );
    expect(
      placedByLines({ placedBy: { ...PRO, company: null }, placedByStaffId: null }).company,
    ).toBeNull();
  });

  it("dit le membre de l'équipe qui l'a saisie, pour le compte de qui", () => {
    const lines = placedByLines({
      placedBy: { ...PRO, staffName: 'Hugo H' },
      placedByStaffId: 'stf_1',
    });
    expect(lines.onBehalf).toBe(
      'Saisie par Hugo H pour le compte de Les Halles (Café des Halles SAS)',
    );
  });

  it("n'invente pas de nom quand l'annuaire ne le connaît plus", () => {
    const lines = placedByLines({
      placedBy: { ...PRO, company: null },
      placedByStaffId: 'stf_parti',
    });
    expect(lines.onBehalf).toBe('Saisie par l’équipe pour le compte de Paul Durand');
  });

  it('sans nom, la personne se dit par son e-mail', () => {
    const anonymous = { ...PRO, customer: { ...PRO.customer, firstName: '', lastName: ' ' } };
    expect(placedByLines({ placedBy: anonymous, placedByStaffId: null }).person).toBe(
      'chef@halles.fr',
    );
  });
});

describe('OrderPlacedByComponent', () => {
  function render(placedBy: AdminOrderPlacedByView, placedByStaffId: string | null): HTMLElement {
    const fixture = TestBed.createComponent(OrderPlacedByComponent);
    const order: Pick<AdminOrderView, 'placedBy' | 'placedByStaffId'> = {
      placedBy,
      placedByStaffId,
    };
    fixture.componentRef.setInput('order', order);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("rend l'e-mail en lien mailto, le téléphone et la société", () => {
    const el = render(PRO, null);
    const mail = el.querySelector('[data-placed-by-email] a');
    expect(mail?.getAttribute('href')).toBe('mailto:chef@halles.fr');
    expect(el.querySelector('[data-placed-by-phone]')?.textContent).toContain('0611223344');
    expect(el.querySelector('[data-placed-by-company]')?.textContent).toContain('Les Halles');
    expect(el.querySelector('[data-placed-by-staff]')).toBeNull();
  });

  it("dit la saisie par l'équipe quand elle a eu lieu", () => {
    const el = render({ ...PRO, staffName: 'Hugo H' }, 'stf_1');
    expect(el.querySelector('[data-placed-by-staff]')?.textContent).toContain('Saisie par Hugo H');
  });
});
