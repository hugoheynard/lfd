import { TestBed } from '@angular/core/testing';
import type { DeferredTerm } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PaiementSection } from '../paiement-section/paiement-section';

interface Rendered {
  readonly host: HTMLElement;
  /** Ce que la section a demandé d'accorder, à chaque bascule. */
  readonly granted: (readonly DeferredTerm[])[];
  readonly section: PaiementSection;
}

function render(
  grantedTerms: readonly DeferredTerm[] = [],
  requestedTerm: DeferredTerm | null = null,
): Rendered {
  const fixture = TestBed.createComponent(PaiementSection);
  fixture.componentRef.setInput('grantedTerms', grantedTerms);
  fixture.componentRef.setInput('requestedTerm', requestedTerm);
  const granted: (readonly DeferredTerm[])[] = [];
  fixture.componentInstance.grantedTermsChange.subscribe((terms) => granted.push(terms));
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    granted,
    section: fixture.componentInstance,
  };
}

describe('section Moyens de paiement', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('montre le paiement à la commande comme TOUJOURS actif', () => {
    // Ce n'est pas un réglage : c'est le socle. Le montrer évite de croire
    // qu'il faut activer quelque chose pour pouvoir vendre.
    const { host } = render([]);

    expect(host.textContent).toContain('À la commande');
    expect(host.textContent).toContain('Toujours actif');
  });

  it('AJOUTE un crédit sans retirer les autres', () => {
    // Tout l'intérêt du cumul : débloquer le mensuel n'enlève rien.
    const { granted, section } = render(['net60']);

    section['toggle']('monthly');

    expect(granted.at(-1)).toEqual(['net60', 'monthly']);
  });

  it('retire un crédit déjà accordé', () => {
    const { granted, section } = render(['monthly', 'net60']);

    section['toggle']('monthly');

    expect(granted.at(-1)).toEqual(['net60']);
  });

  it('signale un crédit demandé par le client et pas encore accordé', () => {
    const { host } = render([], 'monthly');

    expect(host.textContent).toContain('Demandé par le client');
  });

  it('ne le signale plus une fois accordé', () => {
    const { host } = render(['monthly'], 'monthly');

    expect(host.textContent).not.toContain('Demandé par le client');
  });

  it("réclame un mandat dès qu'on facture au terme", () => {
    // Ce qu'on facture, il faut savoir l'encaisser — dit sans bloquer la vente.
    const { host } = render(['monthly']);

    expect(host.textContent).toContain('Aucun mandat de prélèvement');
  });

  it('ne réclame rien tant que tout se paie à la commande', () => {
    const { host } = render([]);

    expect(host.textContent).not.toContain('Aucun mandat');
  });
});
