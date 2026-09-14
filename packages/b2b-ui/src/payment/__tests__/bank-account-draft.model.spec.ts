import type { CompanyBankAccountView, CustomerBankAccountView } from '@lfd/contracts';

import {
  BANK_ACCOUNT_FORM_LABELS_FR,
  bankAccountDraftChanged,
  bankAccountDraftFrom,
  changesMandatedAccount,
  EMPTY_BANK_ACCOUNT_DRAFT,
  hasCountryCode,
  isBankAccountComplete,
  toBankAccountPayload,
  withoutIban,
} from '../bank-account-draft.model';

const CUSTOMER: CustomerBankAccountView = {
  holder: 'Refuge du Col SARL',
  addressLine1: '12 rue des Alpages',
  addressLine2: '',
  postalCode: '73150',
  city: "Val d'Isère",
  countryCode: 'FR',
  bic: 'CEPAFRPP751',
  last4: '2606',
};

const STAFF: CompanyBankAccountView = {
  ...CUSTOMER,
  debtorReference: 'C-9P2X4B',
  contractNumber: '',
};

const IBAN = 'FR1420041010050500013M02606';

describe('brouillon du RIB', () => {
  describe('lecture depuis une vue', () => {
    /** 🔴 L'IBAN ne redescend jamais : la vue n'en porte que `last4`. */
    it('reprend tout SAUF l’IBAN, qui part vide', () => {
      expect(bankAccountDraftFrom(CUSTOMER)).toEqual({
        iban: '',
        bic: 'CEPAFRPP751',
        holder: 'Refuge du Col SARL',
        line1: '12 rue des Alpages',
        line2: '',
        postalCode: '73150',
        city: "Val d'Isère",
        countryCode: 'FR',
      });
    });

    it('lit la vue staff comme la vue client — les zones du mandat ne s’y saisissent pas', () => {
      expect(bankAccountDraftFrom(STAFF)).toEqual(bankAccountDraftFrom(CUSTOMER));
    });

    it('pose le pays par défaut quand la ligne n’en porte pas', () => {
      expect(bankAccountDraftFrom({ ...CUSTOMER, countryCode: '' }).countryCode).toBe('FR');
      expect(EMPTY_BANK_ACCOUNT_DRAFT.countryCode).toBe('FR');
    });
  });

  describe('validation de forme', () => {
    it('refuse tant qu’un champ requis manque, IBAN compris', () => {
      expect(isBankAccountComplete(bankAccountDraftFrom(CUSTOMER))).toBe(false);
      expect(isBankAccountComplete({ ...EMPTY_BANK_ACCOUNT_DRAFT, holder: 'X', iban: IBAN })).toBe(
        false,
      );
    });

    it('accepte dès que tout est là, le complément d’adresse excepté', () => {
      expect(isBankAccountComplete({ ...bankAccountDraftFrom(CUSTOMER), iban: IBAN })).toBe(true);
    });

    it('un champ fait d’espaces compte comme vide', () => {
      expect(isBankAccountComplete({ ...bankAccountDraftFrom(CUSTOMER), iban: '   ' })).toBe(false);
    });

    it('le pays tient en deux lettres, espaces rognés', () => {
      const draft = bankAccountDraftFrom(CUSTOMER);
      expect(hasCountryCode({ ...draft, countryCode: ' fr ' })).toBe(true);
      expect(hasCountryCode({ ...draft, countryCode: 'FRA' })).toBe(false);
      expect(hasCountryCode({ ...draft, countryCode: '' })).toBe(false);
    });
  });

  describe('payload', () => {
    it('rogne chaque champ et met le pays en capitales', () => {
      expect(
        toBankAccountPayload({
          iban: '  FR14 2004 1010 0505 0001 3M02 606 ',
          bic: ' CEPAFRPP751 ',
          holder: ' Refuge du Col SARL ',
          line1: ' 12 rue des Alpages ',
          line2: ' ',
          postalCode: ' 73150 ',
          city: " Val d'Isère ",
          countryCode: ' fr ',
        }),
      ).toEqual({
        iban: 'FR14 2004 1010 0505 0001 3M02 606',
        bic: 'CEPAFRPP751',
        holder: 'Refuge du Col SARL',
        line1: '12 rue des Alpages',
        line2: '',
        postalCode: '73150',
        city: "Val d'Isère",
        countryCode: 'FR',
      });
    });

    it('après un enregistrement, seul l’IBAN se vide', () => {
      const typed = { ...bankAccountDraftFrom(CUSTOMER), iban: IBAN };
      expect(withoutIban(typed)).toEqual({ ...typed, iban: '' });
    });
  });

  describe('compte du mandat actif', () => {
    const typed = (iban: string) => ({ ...bankAccountDraftFrom(CUSTOMER), iban });

    it('prévient quand l’IBAN saisi ne finit pas comme le compte mandaté', () => {
      expect(changesMandatedAccount(typed('FR76 3000 4000 0312 3456 7890 143'), '2606')).toBe(true);
    });

    it('se tait quand c’est le compte du mandat, espaces compris', () => {
      expect(changesMandatedAccount(typed('FR14 2004 1010 0505 0001 3M02 606'), '2606')).toBe(
        false,
      );
    });

    it('se tait tant que moins de quatre caractères sont saisis, et sans mandat actif', () => {
      expect(changesMandatedAccount(typed('FR1'), '2606')).toBe(false);
      expect(changesMandatedAccount(typed(IBAN), '')).toBe(false);
    });
  });

  describe('modifié ou non', () => {
    it('ouvert sur un compte lu et intact : rien n’a changé', () => {
      expect(bankAccountDraftChanged(bankAccountDraftFrom(CUSTOMER), CUSTOMER)).toBe(false);
    });

    it('un champ corrigé est une modification — un espace ajouté ne l’est pas', () => {
      const draft = bankAccountDraftFrom(CUSTOMER);
      expect(bankAccountDraftChanged({ ...draft, line2: 'Bâtiment B' }, CUSTOMER)).toBe(true);
      expect(bankAccountDraftChanged({ ...draft, city: " Val d'Isère " }, CUSTOMER)).toBe(false);
      expect(bankAccountDraftChanged({ ...draft, countryCode: 'fr' }, CUSTOMER)).toBe(false);
    });

    /** 🔴 L'IBAN ne redescend jamais : en saisir un est toujours un changement. */
    it('un IBAN saisi est une modification, même sur le même compte', () => {
      expect(
        bankAccountDraftChanged({ ...bankAccountDraftFrom(CUSTOMER), iban: IBAN }, CUSTOMER),
      ).toBe(true);
    });

    it('sans compte lu, la référence est le brouillon vide', () => {
      expect(bankAccountDraftChanged(EMPTY_BANK_ACCOUNT_DRAFT, null)).toBe(false);
      expect(bankAccountDraftChanged({ ...EMPTY_BANK_ACCOUNT_DRAFT, holder: 'X' }, null)).toBe(
        true,
      );
    });

    /** Constat du 2026-09-14 : corriger une ligne ne suffit pas à rendre le compte enregistrable. */
    it('corriger une ligne d’adresse est modifié, mais incomplet tant que l’IBAN manque', () => {
      const corrected = { ...bankAccountDraftFrom(CUSTOMER), line1: '14 rue des Alpages' };
      expect(bankAccountDraftChanged(corrected, CUSTOMER)).toBe(true);
      expect(isBankAccountComplete(corrected)).toBe(false);
    });
  });

  it('les libellés par défaut sont ceux de la fiche staff', () => {
    expect(BANK_ACCOUNT_FORM_LABELS_FR).toMatchObject({
      holder: 'Titulaire du compte',
      holderPlaceholder: 'Refuge du Col SARL',
      line2Placeholder: 'Bâtiment, étage…',
      country: 'Pays',
      countryPlaceholder: 'FR',
      iban: 'IBAN',
      ibanHint: 'Saisi une fois. Il ne sera plus jamais réaffiché.',
      bic: 'BIC',
      bicPlaceholder: 'CEPAFRPP751',
    });
  });
});
