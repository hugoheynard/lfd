import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type {
  DeferredTerm,
  MandateSectionView,
  MintBlocker,
  PaymentMandateView,
  SepaScheme,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { MandatesService } from '../mandat/mandates.service';
import { PaiementSection } from '../paiement-section/paiement-section';

interface Rendered {
  readonly host: HTMLElement;
  /** Ce que la section a demandé d'accorder, à chaque bascule. */
  readonly granted: (readonly DeferredTerm[])[];
  readonly section: PaiementSection;
  /** Les appels de signature : `[companyId, mandateId, signedAt, proofRevision]`. */
  readonly signed: string[][];
  /** Combien de fois la section a été lue. */
  readonly reads: () => number;
  /** Les messages de refus et d'erreur annoncés, dans l'ordre. */
  readonly refusals: string[];
  /** Rejoue un cycle de rendu (le chargement du mandat est asynchrone). */
  readonly settle: () => Promise<void>;
}

const ACTIVE_MANDATE: PaymentMandateView = {
  id: 'mdt_1',
  reference: 'RUM-1',
  status: 'active',
  scheme: 'B2B',
  last4: '3000',
  bankCode: 'BNPA',
  country: 'FR',
  acceptedAt: '2024-03-12T00:00:00.000Z',
  revokedAt: null,
  hasProof: false,
  proofFileName: '',
  proofRevision: '',
};

/** Le bouton « Activer le mandat », s'il est rendu. */
function activateButton(host: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Activer le mandat'),
  );
}

/** Service de mandat doublé — aucun appel réseau, aucun Stripe. */
function fakeMandates(
  mandate: PaymentMandateView | null,
  mintBlockers: readonly MintBlocker[],
  issuerScheme: SepaScheme | null,
  calls: { reads: number; readonly signed: string[][] },
  signRefusal: HttpErrorResponse | null,
): Partial<MandatesService> {
  return {
    section: (): Promise<MandateSectionView> => {
      calls.reads += 1;
      return Promise.resolve({ mandate, publishableKey: 'pk_test', mintBlockers, issuerScheme });
    },
    sign: (...args: [string, string, string, string]): Promise<void> => {
      calls.signed.push(args);
      return signRefusal === null ? Promise.resolve() : Promise.reject(signRefusal);
    },
  };
}

function render(options: {
  readonly grantedTerms?: readonly DeferredTerm[];
  readonly requestedTerm?: DeferredTerm | null;
  readonly companyId?: string | null;
  readonly mandate?: PaymentMandateView | null;
  readonly mintBlockers?: readonly MintBlocker[];
  readonly issuerScheme?: SepaScheme | null;
  /** Le refus que le serveur rend à la signature ; `null` = elle passe. */
  readonly signRefusal?: HttpErrorResponse | null;
}): Rendered {
  const calls = { reads: 0, signed: [] as string[][] };
  const refusals: string[] = [];
  const announce = (error: unknown, fallback?: string): void => {
    refusals.push(httpErrorMessage(error, fallback));
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: MandatesService,
        useValue: fakeMandates(
          options.mandate ?? null,
          options.mintBlockers ?? [],
          options.issuerScheme ?? null,
          calls,
          options.signRefusal ?? null,
        ),
      },
      {
        provide: NotifyService,
        useValue: { success: (): void => undefined, error: announce, refused: announce },
      },
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
    signed: calls.signed,
    reads: (): number => calls.reads,
    refusals,
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
    expect(host.textContent).toContain('Ouvert à tous');
    // Ce qui compte n'est pas le libellé du badge mais la promesse : il ne
    // s'accorde pas, et il ne se retire pas.
    expect(host.textContent).toContain('il ne se retire pas');
  });

  it('annonce les trois étapes du paiement différé, dans leur ordre', () => {
    // L'ordre est RECOMMANDÉ, pas imposé : c'est un mode d'emploi, et la suite
    // de tests vérifie qu'aucune étape n'est verrouillée par la précédente.
    const { host } = render({});

    expect(host.textContent).toContain('1 · Coordonnées bancaires');
    expect(host.textContent).toContain('2 · Mandat SEPA');
    expect(host.textContent).toContain('3 · Règlement périodique');
  });

  it('décrit la frise par des libellés, pas par des pastilles seules', async () => {
    // Un libellé qui change se lit sans avoir appris le code couleur — et reste
    // lisible quand on ne voit pas la pastille.
    const { section, settle } = render({ companyId: 'cmp_1' });
    await settle();

    const steps = section['steps']();
    expect(steps.map((step) => step.label)).toEqual([
      'Aucun RIB enregistré',
      'Aucun mandat de prélèvement',
      'Aucun règlement périodique ouvert',
    ]);
    expect(steps.every((step) => step.done === false)).toBe(true);
  });

  it('marque l’étape du règlement dès qu’un crédit est accordé, mandat ou pas', async () => {
    // 🔴 La frise DÉCRIT, elle ne commande pas. Un commercial débloque un crédit
    // devant son client et fait suivre le mandat : si l'étape 3 attendait
    // l'étape 2, l'écran mentirait sur ce qui vient d'être fait.
    const { section, settle } = render({ companyId: 'cmp_1', grantedTerms: ['monthly'] });
    await settle();

    const steps = section['steps']();
    expect(steps[2]?.done).toBe(true);
    expect(steps[1]?.done).toBe(false);
  });

  it('distingue un mandat RÉVOQUÉ d’un mandat absent', async () => {
    // Les deux sont « pas de prélèvement possible », et ils ne se réparent pas
    // du même geste : l'un n'a jamais existé, l'autre a été retiré.
    const { section, settle } = render({
      companyId: 'cmp_1',
      mandate: { ...ACTIVE_MANDATE, status: 'revoked', revokedAt: '2026-02-01T00:00:00.000Z' },
    });
    await settle();

    expect(section['steps']()[1]?.label).toContain('••••3000');
    expect(section['steps']()[1]?.done).toBe(false);
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

  it('demande la fin de la RUM pour révoquer le mandat', async () => {
    // Taper autre chose signifie qu'on ne regardait pas le bon mandat.
    const { section, settle } = render({
      companyId: 'cmp_1',
      mandate: { ...ACTIVE_MANDATE, reference: 'LFC-9P2X4B-260912-K7M3QT' },
    });
    await settle();

    expect(section['dangerous']()).toEqual([
      expect.objectContaining({ key: 'mandate', match: 'K7M3QT' }),
    ]);
  });

  /**
   * 🔴 Régression : un BROUILLON n'était listé nulle part. Impossible de
   * l'abandonner à l'écran, et l'index d'unicité interdit d'en frapper un
   * second : une société à laquelle on avait frappé un mandat erroné n'avait
   * aucune sortie, sauf en SQL.
   */
  it('laisse abandonner un brouillon — sinon la société reste bloquée', async () => {
    const { section, settle } = render({
      companyId: 'cmp_1',
      mandate: {
        ...ACTIVE_MANDATE,
        status: 'draft',
        acceptedAt: null,
        last4: '',
        reference: 'LFC-6KTQAT-260913-HZMF98',
      },
    });
    await settle();

    const mandate = section['dangerous']().find((action) => action.key === 'mandate');

    expect(mandate?.label).toContain('Abandonner');
    expect(mandate?.match).toBe('HZMF98');
    // Un brouillon n'a jamais autorisé personne : dire qu'on retire un
    // prélèvement ferait croire qu'on enlève quelque chose au client.
    expect(mandate?.consequence).not.toContain('Plus aucun prélèvement');
  });

  /**
   * 🔴 Régression : le mot à taper était `last4`, qui vient du mandat Stripe. Un
   * mandat que NOUS frappons naît sans — il peut l'être avant même que le RIB
   * soit recopié. La confirmation demandait donc de retaper une chaîne VIDE, et
   * la révocation était inatteignable depuis l'écran sans que rien ne le dise.
   */
  it('reste révocable quand le mandat n’a pas de `last4` — le cas des mandats frappés ici', async () => {
    const { section, settle } = render({
      companyId: 'cmp_1',
      mandate: { ...ACTIVE_MANDATE, last4: '', reference: 'LFC-6KTQAT-260913-S54CQZ' },
    });
    await settle();

    const mandate = section['dangerous']().find((action) => action.key === 'mandate');

    expect(mandate?.match).toBe('S54CQZ');
    expect(mandate?.match).not.toBe('');
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

  /**
   * 🔴 Depuis le 2026-09-14 : le serveur refuse le scan d'un mandat actif et
   * l'activation d'un brouillon sans scan. L'écran propose donc le dépôt sur le
   * brouillon, et n'active qu'une fois la pièce déposée.
   */
  it("n'active un brouillon qu'une fois son scan déposé", async () => {
    const draft: PaymentMandateView = {
      ...ACTIVE_MANDATE,
      status: 'draft',
      acceptedAt: null,
      last4: '',
    };
    const naked = render({ companyId: 'cmp_1', mandate: draft });
    await naked.settle();
    naked.section['signedAt'].set('2026-09-10');
    await naked.settle();

    expect(naked.host.textContent).toContain('Déposer le scan');
    expect(naked.host.textContent).toContain("Déposez d'abord le scan");
    expect(activateButton(naked.host)?.disabled).toBe(true);

    TestBed.resetTestingModule();
    const proven = render({
      companyId: 'cmp_1',
      mandate: { ...draft, hasProof: true, proofFileName: 'mandat-signe.pdf' },
    });
    await proven.settle();
    proven.section['signedAt'].set('2026-09-10');
    await proven.settle();

    expect(activateButton(proven.host)?.disabled).toBe(false);
  });

  describe('la signature atteste la pièce relue', () => {
    const PROVEN_DRAFT: PaymentMandateView = {
      ...ACTIVE_MANDATE,
      status: 'draft',
      acceptedAt: null,
      last4: '',
      hasProof: true,
      proofFileName: 'mandat-signe.pdf',
      proofRevision: 'rev-lue',
    };

    it('envoie la `proofRevision` de la vue que le staff regarde', async () => {
      const { section, signed, settle } = render({ companyId: 'cmp_1', mandate: PROVEN_DRAFT });
      await settle();
      section['signedAt'].set('2026-09-10');

      await section['sign']();

      expect(signed).toEqual([['cmp_1', 'mdt_1', '2026-09-10', 'rev-lue']]);
    });

    /**
     * Plan `plan-restes-du-mandat.md` §7 #9 : sans ce refus, le staff activait un
     * mandat sur un scan remplacé entre-temps, qu'il n'avait jamais regardé.
     */
    it('sur une pièce remplacée entre-temps, le dit clairement et relit la section', async () => {
      const { section, refusals, reads, settle } = render({
        companyId: 'cmp_1',
        mandate: PROVEN_DRAFT,
        signRefusal: new HttpErrorResponse({
          status: 409,
          error: {
            code: 'payments.mandate.proof_revision_stale',
            message: 'Le scan de ce mandat a été remplacé depuis que la fiche a été ouverte.',
          },
        }),
      });
      await settle();
      const before = reads();
      section['signedAt'].set('2026-09-10');

      await section['sign']();

      expect(refusals).toEqual([
        "La pièce a été remplacée depuis que vous l'avez ouverte : relisez-la avant d'activer.",
      ]);
      expect(reads()).toBe(before + 1);
      // La date du papier reste saisie : relire le scan puis réactiver suffit.
      expect(section['signedAt']()).toBe('2026-09-10');
    });

    it('un autre refus garde le message du serveur et ne relit pas', async () => {
      const { section, refusals, reads, settle } = render({
        companyId: 'cmp_1',
        mandate: PROVEN_DRAFT,
        signRefusal: new HttpErrorResponse({
          status: 400,
          error: {
            code: 'payments.mandate.acceptance_in_future',
            message: 'La date de signature est dans le futur.',
          },
        }),
      });
      await settle();
      const before = reads();
      section['signedAt'].set('2099-01-01');

      await section['sign']();

      expect(refusals).toEqual(['La date de signature est dans le futur.']);
      expect(reads()).toBe(before);
    });
  });

  it('ne propose plus de déposer un scan sur un mandat actif', async () => {
    const { host, settle } = render({ companyId: 'cmp_1', mandate: ACTIVE_MANDATE });
    await settle();

    expect(host.textContent).not.toContain('Déposer le scan');
    expect(host.textContent).not.toContain('Remplacer');
  });

  it('ne montre le mandat que sur une société qui existe', () => {
    // À l'ouverture d'un compte, il n'y a rien à mandater : la société n'existe
    // pas encore.
    const { host } = render({ companyId: null });

    expect(host.textContent).not.toContain('Prélèvement SEPA');
  });
});

describe('section Moyens de paiement — le schéma du mandat', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('porte la puce du schéma figé sur le mandat', async () => {
    const { host, settle } = render({ companyId: 'cmp_1', mandate: ACTIVE_MANDATE });
    await settle();

    expect(host.querySelector('fold-badge.pm-scheme')?.textContent).toContain(
      'SEPA interentreprises (B2B)',
    );
  });

  it('dit CORE pour un mandat frappé en CORE, quel que soit le réglage de l’entité', async () => {
    const { host, settle } = render({
      companyId: 'cmp_1',
      mandate: { ...ACTIVE_MANDATE, scheme: 'CORE' },
    });
    await settle();

    expect(host.querySelector('fold-badge.pm-scheme')?.textContent).toContain('SEPA CORE');
  });
});

describe('section Moyens de paiement — les mentions manquantes du mandat', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  /** Le bouton « Frapper le mandat », s'il est rendu. */
  const mintButton = (host: HTMLElement): HTMLButtonElement | undefined =>
    Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Frapper le mandat'),
    );

  it('désactive « Frapper » et nomme chaque mention manquante, avec l’endroit où la saisir', async () => {
    const { host, section, settle } = render({
      companyId: 'cmp_1',
      mintBlockers: ['siren_missing', 'holder_legal_form_missing'],
    });
    await settle();

    expect(mintButton(host)?.disabled).toBe(true);
    const callout = host.querySelector('fold-callout[variant="warning"]');
    expect(callout?.textContent).toContain('le SIREN — Identité légale');
    expect(callout?.textContent).toContain(
      'la civilité ou forme juridique du titulaire du compte — Coordonnées bancaires',
    );
    expect(section['canMint']()).toBe(false);
  });

  it('propose le geste qui saisit chaque mention : l’identité légale, et le RIB', async () => {
    const { host, section, settle } = render({
      companyId: 'cmp_1',
      mintBlockers: ['company_name_missing', 'bank_account_missing'],
    });
    await settle();
    const asked: string[] = [];
    section.editIdentity.subscribe(() => asked.push('identity'));

    const gestures = Array.from(host.querySelectorAll('fold-callout button'));
    expect(gestures.map((button) => button.textContent?.trim())).toEqual([
      "Compléter l'identité légale",
      'Aller au RIB',
    ]);
    (gestures[0] as HTMLButtonElement).click();
    expect(asked).toEqual(['identity']);
  });

  it('sans mention manquante, « Frapper » est armé et aucune liste ne s’affiche', async () => {
    const { host, section, settle } = render({ companyId: 'cmp_1' });
    await settle();

    expect(mintButton(host)?.disabled).toBe(false);
    expect(host.querySelector('fold-callout[variant="warning"]')).toBeNull();
    expect(section['canMint']()).toBe(true);
  });

  it('l’émetteur manquant se dit, sans geste : il ne se saisit pas sur la fiche client', async () => {
    const { host, settle } = render({ companyId: 'cmp_1', mintBlockers: ['issuer_missing'] });
    await settle();

    const callout = host.querySelector('fold-callout[variant="warning"]');
    expect(callout?.textContent).toContain('Comptabilité › Entités juridiques');
    expect(callout?.querySelectorAll('button').length).toBe(0);
  });

  describe('la forme juridique du titulaire, exigée selon le schéma de l’émetteur', () => {
    it('interentreprises : le RIB l’exige', async () => {
      const { section, settle } = render({ companyId: 'cmp_1', issuerScheme: 'B2B' });
      await settle();

      expect(section['holderLegalFormRequired']()).toBe(true);
    });

    it('CORE ou schéma inconnu : le RIB ne l’exige pas, le serveur reste le garde', async () => {
      for (const issuerScheme of ['CORE', null] as const) {
        TestBed.resetTestingModule();
        const { section, settle } = render({ companyId: 'cmp_1', issuerScheme });
        await settle();

        expect(section['holderLegalFormRequired']()).toBe(false);
      }
    });
  });

  it('ne liste rien sous un brouillon : il n’y a rien à frapper', async () => {
    const { host, settle } = render({
      companyId: 'cmp_1',
      mandate: { ...ACTIVE_MANDATE, status: 'draft', acceptedAt: null },
      mintBlockers: ['siren_missing'],
    });
    await settle();

    expect(host.querySelector('fold-callout[variant="warning"]')).toBeNull();
  });
});
