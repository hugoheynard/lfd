import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type {
  CompanyBankAccountSectionView,
  CompanyBankAccountView,
  SetCompanyBankAccountPayload,
} from '@lfd/contracts';
import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from '@lfd/endpoints';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { BankAccountService } from '../bank-account/bank-account.service';
import { BankAccountSection } from '../bank-account-section/bank-account-section';

const SAVED: CompanyBankAccountView = {
  holder: 'Refuge du Col SARL',
  holderLegalForm: 'SARL',
  addressLine1: '12 rue des Alpages',
  addressLine2: '',
  postalCode: '73150',
  city: "Val d'Isère",
  countryCode: 'FR',
  bic: 'CEPAFRPP751',
  last4: '2606',
  debtorReference: 'C-9P2X4B',
  contractNumber: '',
};

interface Rendered {
  readonly host: HTMLElement;
  readonly section: BankAccountSection;
  /** Ce que le composant a demandé d'enregistrer, à chaque appel. */
  readonly written: SetCompanyBankAccountPayload[];
  readonly settle: () => Promise<void>;
}

/** Service doublé — aucun appel réseau. */
function fakeAccounts(
  account: CompanyBankAccountView | null,
  written: SetCompanyBankAccountPayload[],
  refusal: HttpErrorResponse | null,
): Partial<BankAccountService> {
  return {
    read: (): Promise<CompanyBankAccountSectionView> => Promise.resolve({ account }),
    save: (_companyId: string, payload: SetCompanyBankAccountPayload): Promise<void> => {
      written.push(payload);
      return refusal === null ? Promise.resolve() : Promise.reject(refusal);
    },
  };
}

function render(options: {
  readonly account?: CompanyBankAccountView | null;
  readonly companyId?: string | null;
  readonly mandateActive?: boolean;
  readonly holderLegalFormRequired?: boolean;
  /** Le refus que le serveur rend à l'écriture ; `null` = elle passe. */
  readonly refusal?: HttpErrorResponse | null;
  /** Les messages d'erreur annoncés, dans l'ordre. */
  readonly errors?: string[];
}): Rendered {
  const written: SetCompanyBankAccountPayload[] = [];
  const errors = options.errors ?? [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: BankAccountService,
        useValue: fakeAccounts(options.account ?? null, written, options.refusal ?? null),
      },
      {
        provide: NotifyService,
        useValue: {
          success: (): void => undefined,
          error: (error: unknown, fallback?: string): void => {
            errors.push(httpErrorMessage(error, fallback));
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(BankAccountSection);
  fixture.componentRef.setInput('companyId', options.companyId ?? 'cmp_1');
  fixture.componentRef.setInput('mandateActive', options.mandateActive ?? false);
  fixture.componentRef.setInput(
    'holderLegalFormRequired',
    options.holderLegalFormRequired ?? false,
  );
  fixture.detectChanges();

  return {
    host: fixture.nativeElement as HTMLElement,
    section: fixture.componentInstance,
    written,
    settle: async (): Promise<void> => {
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('RIB du client — ce que la fiche montre', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("dit qu'aucun RIB n'est enregistré plutôt que de laisser un vide", async () => {
    const { host, settle } = render({ account: null });
    await settle();

    expect(host.textContent).toContain('Aucun RIB enregistré');
  });

  it('annonce que ces informations partent sur le mandat signé', async () => {
    // Ces champs ne servent pas qu'à l'écran : le dire ici évite de le
    // redécouvrir en relisant un mandat imprimé.
    const { host, settle } = render({ account: null });
    await settle();

    expect(host.textContent).toContain("s'impriment sur le mandat SEPA");
  });

  it('montre le compte enregistré par ses quatre derniers, son BIC et son titulaire', async () => {
    const { host, settle } = render({ account: SAVED });
    await settle();

    expect(host.textContent).toContain('2606');
    expect(host.textContent).toContain('CEPAFRPP751');
    expect(host.textContent).toContain('Refuge du Col SARL');
    expect(host.textContent).toContain('(SARL)');
  });

  it('reprend la civilité ou forme juridique du titulaire, et la renvoie', async () => {
    const { section, written, settle } = render({ account: SAVED });
    await settle();

    expect(section['draft']().holderLegalForm).toBe('SARL');
    section['draft'].update((d) => ({
      ...d,
      holderLegalForm: ' SAS ',
      iban: 'FR1420041010050500013M02606',
    }));
    await section['save']();

    expect(written[0]?.holderLegalForm).toBe('SAS');
  });

  it('refuse d’enregistrer une civilité ou forme juridique de plus de 40 caractères', async () => {
    const { section, settle } = render({ account: SAVED });
    await settle();

    section['draft'].update((d) => ({
      ...d,
      holderLegalForm: 'x'.repeat(41),
      iban: 'FR1420041010050500013M02606',
    }));
    expect(section['canSave']()).toBe(false);
  });

  describe('la civilité ou forme juridique du titulaire, selon le schéma de l’émetteur', () => {
    const IBAN = 'FR1420041010050500013M02606';
    /** Les marques « (facultatif) » que fold pose sous les libellés du formulaire. */
    const optionalMarks = (host: HTMLElement): number => host.querySelectorAll('.opt').length;

    it('exigée (interentreprises) : vide, « Enregistrer » est désarmé ; remplie, il s’arme', async () => {
      const { section, settle } = render({ account: SAVED, holderLegalFormRequired: true });
      await settle();

      section['draft'].update((d) => ({ ...d, holderLegalForm: '  ', iban: IBAN }));
      expect(section['canSave']()).toBe(false);
      section['draft'].update((d) => ({ ...d, holderLegalForm: 'SARL' }));
      expect(section['canSave']()).toBe(true);
    });

    it('exigée, le champ perd sa marque « facultatif » ; sinon il la garde', async () => {
      const required = render({ account: null, holderLegalFormRequired: true });
      await required.settle();
      expect(optionalMarks(required.host)).toBe(0);

      TestBed.resetTestingModule();
      const optional = render({ account: null });
      await optional.settle();
      expect(optionalMarks(optional.host)).toBe(1);
    });

    it('facultative (CORE ou inconnu) : vide, rien ne bloque — le serveur reste le garde', async () => {
      const { section, settle } = render({ account: SAVED });
      await settle();

      section['draft'].update((d) => ({ ...d, holderLegalForm: '', iban: IBAN }));
      expect(section['canSave']()).toBe(true);
    });

    it('le libellé donne les exemples de civilité et de forme juridique', async () => {
      const { host, settle } = render({ account: null });
      await settle();

      expect(host.textContent).toContain('Civilité (M., Mme) ou forme juridique (SAS, SARL…)');
    });
  });

  /**
   * 🔴 Le champ IBAN repart VIDE même quand un compte existe : il ne revient
   * d'aucune route. Le préremplir supposerait de le faire redescendre — et une
   * réponse qui porte un IBAN entier finit dans un journal d'accès.
   */
  it("ne préremplit jamais l'IBAN, mais reprend tout le reste", async () => {
    const { section, settle } = render({ account: SAVED });
    await settle();

    expect(section['draft']().iban).toBe('');
    expect(section['draft']().holder).toBe('Refuge du Col SARL');
    expect(section['draft']().bic).toBe('CEPAFRPP751');
    expect(section['draft']().city).toBe("Val d'Isère");
  });

  it('refuse d’enregistrer tant que le RIB est incomplet', async () => {
    // Un compte à moitié rempli ne se découvrirait qu'au rejet du lot, cinq
    // jours après l'envoi.
    const { section, settle } = render({ account: null });
    await settle();

    section['draft'].update((d) => ({
      ...d,
      holder: 'Refuge du Col SARL',
      iban: 'FR1420041010050500013M02606',
    }));
    expect(section['canSave']()).toBe(false);
  });

  it('accepte dès que tout est là, le complément d’adresse excepté', async () => {
    const { section, settle } = render({ account: SAVED });
    await settle();

    section['draft'].update((d) => ({ ...d, iban: 'FR1420041010050500013M02606' }));
    expect(section['canSave']()).toBe(true);
  });

  it('envoie le RIB normalisé et vide le seul champ IBAN', async () => {
    const { section, written, settle } = render({ account: SAVED });
    await settle();

    section['draft'].update((d) => ({
      ...d,
      iban: '  fr14 2004 1010 0505 0001 3m02 606 ',
      countryCode: 'fr',
    }));
    await section['save']();

    expect(written).toHaveLength(1);
    expect(written[0]?.countryCode).toBe('FR');
    expect(written[0]?.holder).toBe('Refuge du Col SARL');
    // Seul l'IBAN se vide : effacer le reste donnerait l'impression qu'il a
    // été perdu.
    expect(section['draft']().iban).toBe('');
    expect(section['draft']().holder).toBe('Refuge du Col SARL');
  });

  /**
   * Plan `plan-restes-du-mandat.md` §8 : le staff est refusé comme le client
   * quand il remplace le RIB sous un mandat actif. L'écran le dit avant le geste.
   */
  describe('sous un mandat actif', () => {
    const IBAN = 'FR7630004000031234567890143';

    it('désarme le formulaire et le bouton, même RIB complet', async () => {
      const { host, section, settle } = render({ account: SAVED, mandateActive: true });
      await settle();

      section['draft'].update((d) => ({ ...d, iban: IBAN }));
      await settle();

      expect(host.querySelector('fieldset')?.disabled).toBe(true);
      expect(section['canSave']()).toBe(false);
      const replace = Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Remplacer le RIB'),
      );
      expect(replace?.disabled).toBe(true);
    });

    it('dit pourquoi, et le geste de sortie : révoquer, puis frapper un nouveau mandat', async () => {
      const { host, settle } = render({ account: SAVED, mandateActive: true });
      await settle();

      const callout = host.querySelector('fold-callout[variant="warning"]');
      expect(callout?.textContent).toContain('ne se remplace pas sous un mandat actif');
      expect(callout?.textContent).toContain('révoquez');
      expect(callout?.textContent).toContain('frappez un nouveau');
    });

    it('sans mandat actif, le formulaire reste armé et rien ne prévient', async () => {
      const { host, section, settle } = render({ account: SAVED });
      await settle();

      section['draft'].update((d) => ({ ...d, iban: IBAN }));
      await settle();

      expect(host.querySelector('fieldset')?.disabled).toBe(false);
      expect(section['canSave']()).toBe(true);
      expect(host.querySelector('fold-callout[variant="warning"]')).toBeNull();
    });

    it('affiche le message du 409 reçu malgré tout, et relit le RIB', async () => {
      // Le mandat a pu devenir actif entre la lecture de la fiche et le clic.
      const message =
        'Le mandat de prélèvement actif désigne ce compte : révoquez-le avant de changer de RIB.';
      const errors: string[] = [];
      const accounts: CompanyBankAccountView[] = [];
      const { section, settle } = render({
        account: SAVED,
        errors,
        refusal: new HttpErrorResponse({
          status: 409,
          error: { code: 'payments.bank_account.bound_to_active_mandate', message },
        }),
      });
      await settle();
      section.accountChange.subscribe((account) => {
        if (account !== null) {
          accounts.push(account);
        }
      });

      section['draft'].update((d) => ({ ...d, iban: IBAN }));
      await section['save']();

      expect(errors).toEqual([message]);
      expect(accounts).toHaveLength(1);
    });
  });

  it('reste muet si la lecture échoue — le RIB est un à-côté de la fiche', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: BankAccountService,
          useValue: { read: (): Promise<never> => Promise.reject(new Error('réseau')) },
        },
      ],
    });
    const fixture = TestBed.createComponent(BankAccountSection);
    fixture.componentRef.setInput('companyId', 'cmp_1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Aucun RIB enregistré');
  });
});
