import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PaymentTerm } from '../../comptes-clients/admin-company';
import { PaiementSection } from '../paiement-section/paiement-section';

function render(term: PaymentTerm, requested: PaymentTerm | null = null): HTMLElement {
  const fixture = TestBed.createComponent(PaiementSection);
  fixture.componentRef.setInput('term', term);
  fixture.componentRef.setInput('requestedTerm', requested);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('section Moyens de paiement', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("dit COMMENT on encaisse, pas seulement quand c'est dû", () => {
    // Deux questions distinctes que le terme confond aujourd'hui : le
    // commercial a besoin des deux avant de s'engager.
    expect(render('per_order').textContent).toContain('Carte bancaire');
    expect(render('net60').textContent).toContain('hors plateforme');
  });

  it('signale une demande de terme en attente', () => {
    const host = render('per_order', 'net60');

    expect(host.textContent).toContain('Le client demande');
    expect(host.textContent).toContain('60 jours');
  });

  it('ne signale RIEN quand la demande a déjà été accordée', () => {
    // Une demande identique au terme en place n'est pas en attente : la montrer
    // ferait croire à un arbitrage à rendre alors qu'il l'a déjà été.
    const host = render('net60', 'net60');

    expect(host.textContent).not.toContain('Le client demande');
  });

  it("annonce que le prélèvement SEPA n'existe pas", () => {
    // La fiche est l'endroit où l'on vérifie AVANT de promettre. Taire une
    // capacité absente laisserait l'engager auprès du client.
    expect(render('monthly').textContent).toContain("n'est pas disponible");
  });
});
