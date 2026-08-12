import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { DeferredTerm, MandateSectionView, PaymentMandateView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { MandatesService } from '../mandat/mandates.service';
import { PaiementSection } from '../paiement-section/paiement-section';

interface Rendered {
  readonly host: HTMLElement;
  /** Ce que la section a demandé d'accorder, à chaque bascule. */
  readonly granted: (readonly DeferredTerm[])[];
  readonly section: PaiementSection;
  /** Rejoue un cycle de rendu (le chargement du mandat est asynchrone). */
  readonly settle: () => Promise<void>;
}

const ACTIVE_MANDATE: PaymentMandateView = {
  id: 'mdt_1',
  reference: 'RUM-1',
  status: 'active',
  last4: '3000',
  bankCode: 'BNPA',
  country: 'FR',
  acceptedAt: '2024-03-12T00:00:00.000Z',
  revokedAt: null,
  hasProof: false,
  proofFileName: '',
};

/** Service de mandat doublé — aucun appel réseau, aucun Stripe. */
function fakeMandates(mandate: PaymentMandateView | null): Partial<MandatesService> {
  return {
    section: (): Promise<MandateSectionView> =>
      Promise.resolve({ mandate, publishableKey: 'pk_test' }),
  };
}

function render(options: {
  readonly grantedTerms?: readonly DeferredTerm[];
  readonly requestedTerm?: DeferredTerm | null;
  readonly companyId?: string | null;
  readonly mandate?: PaymentMandateView | null;
}): Rendered {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MandatesService, useValue: fakeMandates(options.mandate ?? null) },
    ],
  });

  const fixture = TestBed.createComponent(PaiementSection);
  fixture.componentRef.setInput('grantedTerms', options.grantedTerms ?? []);
  fixture.componentRef.setInput('requestedTerm', options.requestedTerm ?? null);
  fixture.componentRef.setInput('companyId', options.companyId ?? null);
  const granted: (readonly DeferredTerm[])[] = [];
  fixture.componentInstance.grantedTermsChange.subscribe((terms) => granted.push(terms));
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    granted,
    section: fixture.componentInstance,
    settle: async (): Promise<void> => {
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('section Moyens de paiement — le socle et les crédits', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('montre le paiement à la commande comme TOUJOURS actif', () => {
    // Ce n'est pas un réglage : c'est le socle. Le montrer évite de croire
    // qu'il faut activer quelque chose pour pouvoir vendre.
    const { host } = render({});

    expect(host.textContent).toContain('À la commande');
    expect(host.textContent).toContain('Toujours actif');
  });

  it('ACCORDE le mensuel sans toucher au socle', () => {
    // Le paiement à la commande n'est pas un réglage : il reste offert quoi
    // qu'on accorde. Accorder ajoute une possibilité, il n'en retire aucune.
    const { granted, section } = render({});

    section['toggle']('monthly');

    expect(granted.at(-1)).toEqual(['monthly']);
  });

  it('RETIRE le crédit quand on le rebascule', () => {
    const { granted, section } = render({ grantedTerms: ['monthly'] });

    section['toggle']('monthly');

    expect(granted.at(-1)).toEqual([]);
  });

  it('signale un crédit demandé par le client et pas encore accordé', () => {
    const { host } = render({ requestedTerm: 'monthly' });

    expect(host.textContent).toContain('Demandé par le client');
  });

  it('ne le signale plus une fois accordé', () => {
    const { host } = render({ grantedTerms: ['monthly'], requestedTerm: 'monthly' });

    expect(host.textContent).not.toContain('Demandé par le client');
  });
});

describe('section Moyens de paiement — la zone de danger', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("n'offre AUCUN retrait à côté du bouton qui débloque", () => {
    // Un « Retirer » posé à côté d'un « Débloquer » finit par être cliqué, et le
    // client ne l'apprend qu'à la commande suivante.
    const { host } = render({ grantedTerms: ['monthly'] });

    const inCards = [...host.querySelectorAll('fold-card button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(inCards).not.toContain('Retirer');
  });

  it('rassemble les retraits en zone de danger, avec le mot à taper', () => {
    const { host, section } = render({ grantedTerms: ['monthly'] });

    expect(host.querySelector('fold-danger-zone')).not.toBeNull();
    expect(section['dangerous']()).toEqual([
      expect.objectContaining({ key: 'monthly', match: 'Mensuel' }),
    ]);
  });

  it("n'affiche aucune zone de danger quand il n'y a rien à retirer", () => {
    // Une section « dangereuse » toujours affichée cesse d'être lue.
    const { host } = render({});

    expect(host.querySelector('fold-danger-zone')).toBeNull();
  });

  it('demande les 4 chiffres du compte pour révoquer le mandat', async () => {
    // Taper autre chose signifie qu'on ne regardait pas la bonne fiche.
    const { section, settle } = render({ companyId: 'cmp_1', mandate: ACTIVE_MANDATE });
    await settle();

    expect(section['dangerous']()).toEqual([
      expect.objectContaining({ key: 'mandate', match: '3000' }),
    ]);
  });
});

describe('section Moyens de paiement — le mandat', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("réclame un mandat dès qu'on facture au terme", async () => {
    // Ce qu'on facture, il faut savoir l'encaisser — dit sans bloquer la vente.
    const { host, settle } = render({ companyId: 'cmp_1', grantedTerms: ['monthly'] });
    await settle();

    expect(host.textContent).toContain('Rien pour encaisser');
  });

  it('ne réclame rien tant que tout se paie à la commande', async () => {
    const { host, settle } = render({ companyId: 'cmp_1' });
    await settle();

    expect(host.textContent).not.toContain('Rien pour encaisser');
  });

  it('dit franchement quand un mandat actif est SANS pièce justificative', async () => {
    // Un mandat actif sans scan est un mandat sans filet : l'afficher comme un
    // mandat normal reviendrait à cacher le seul risque qui compte ici.
    const { host, settle } = render({ companyId: 'cmp_1', mandate: ACTIVE_MANDATE });
    await settle();

    expect(host.textContent).toContain('Mandat sans pièce justificative');
  });

  it('ne montre le mandat que sur une société qui existe', () => {
    // À l'ouverture d'un compte, il n'y a rien à mandater : la société n'existe
    // pas encore.
    const { host } = render({ companyId: null });

    expect(host.textContent).not.toContain('Prélèvement SEPA');
  });
});
