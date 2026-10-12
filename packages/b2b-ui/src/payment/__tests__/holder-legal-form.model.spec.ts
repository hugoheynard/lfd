import { EMPTY_BANK_ACCOUNT_DRAFT, holderLegalFormFits } from '../bank-account-draft.model';
import {
  HOLDER_LEGAL_FORM_OTHER,
  holderLegalFormFromCompany,
  holderLegalFormFromSelection,
  holderLegalFormPreview,
  holderLegalFormStateOf,
} from '../holder-legal-form.model';

/**
 * Régression (2026-10-12) : la case était libre, et la commerciale y tapait
 * « Col Pers SAS » au lieu de « SAS » — le mandat imprimait le nom deux fois.
 */
describe('la case « civilité ou forme juridique » du RIB', () => {
  describe('lecture d’une valeur enregistrée', () => {
    it('reprend la ligne d’une forme de la liste, casse comprise', () => {
      expect(holderLegalFormStateOf('SAS')).toEqual({ selection: 'SAS', other: '' });
      expect(holderLegalFormStateOf(' sarl ')).toEqual({ selection: 'SARL', other: '' });
      expect(holderLegalFormStateOf('mme')).toEqual({ selection: 'Mme', other: '' });
      expect(holderLegalFormStateOf('Mlle')).toEqual({ selection: 'Mlle', other: '' });
      expect(holderLegalFormStateOf('Société de droit étranger')).toEqual({
        selection: 'Société de droit étranger',
        other: '',
      });
    });

    it('montre « Micro-entreprise », retirée de la liste du RIB, en « Autre »', () => {
      expect(holderLegalFormStateOf('Micro-entreprise')).toEqual({
        selection: HOLDER_LEGAL_FORM_OTHER,
        other: 'Micro-entreprise',
      });
    });

    it('montre une valeur hors liste en « Autre », sans l’effacer', () => {
      expect(holderLegalFormStateOf('Col Pers SAS')).toEqual({
        selection: HOLDER_LEGAL_FORM_OTHER,
        other: 'Col Pers SAS',
      });
    });

    it('ne choisit rien pour une case vide', () => {
      expect(holderLegalFormStateOf('  ')).toEqual({ selection: null, other: '' });
    });
  });

  describe('choix dans la liste', () => {
    it('pose le LIBELLÉ choisi — c’est lui qui s’imprime', () => {
      expect(holderLegalFormFromSelection('SASU', 'Col Pers SAS')).toBe('SASU');
      expect(holderLegalFormFromSelection('Entreprise individuelle', '')).toBe(
        'Entreprise individuelle',
      );
    });

    it('« Autre » ouvre une saisie vide quand la valeur était une forme de la liste', () => {
      expect(holderLegalFormFromSelection(HOLDER_LEGAL_FORM_OTHER, 'SAS')).toBe('');
    });

    it('« Autre » garde une saisie libre déjà là', () => {
      expect(holderLegalFormFromSelection(HOLDER_LEGAL_FORM_OTHER, 'GIE')).toBe('GIE');
    });
  });

  describe('« Autre » court', () => {
    it('tient en 12 caractères au plus', () => {
      const draft = { ...EMPTY_BANK_ACCOUNT_DRAFT, holderLegalForm: 'x'.repeat(12) };
      expect(holderLegalFormFits(draft)).toBe(true);
      expect(holderLegalFormFits({ ...draft, holderLegalForm: 'x'.repeat(13) })).toBe(false);
    });

    it('ne borne pas un libellé de la liste', () => {
      const draft = { ...EMPTY_BANK_ACCOUNT_DRAFT, holderLegalForm: 'Société de droit étranger' };
      expect(holderLegalFormFits(draft)).toBe(true);
    });
  });

  describe('préremplissage depuis la société', () => {
    it('propose le libellé de la forme de la société — c’est la même liste', () => {
      expect(holderLegalFormFromCompany('sas')).toBe('SAS');
      expect(holderLegalFormFromCompany('ei')).toBe('Entreprise individuelle');
      expect(holderLegalFormFromCompany('foreign')).toBe('Société de droit étranger');
    });

    it('propose « Entreprise individuelle » à une micro-entreprise ou un auto-entrepreneur', () => {
      expect(holderLegalFormFromCompany('micro')).toBe('Entreprise individuelle');
      expect(holderLegalFormFromCompany('auto_entrepreneur')).toBe('Entreprise individuelle');
    });

    it('reconnaît une saisie d’avant le catalogue (« S.A.S. »)', () => {
      expect(holderLegalFormFromCompany('S.A.S.')).toBe('SAS');
    });

    it('n’invente rien pour une forme inconnue', () => {
      expect(holderLegalFormFromCompany('')).toBe('');
      expect(holderLegalFormFromCompany('Coopérative maison')).toBe('');
    });
  });

  describe('aperçu imprimé', () => {
    it('met la forme devant le titulaire', () => {
      expect(holderLegalFormPreview(' Col Pers ', 'SAS')).toBe('SAS · Col Pers');
    });

    it('se passe d’un morceau manquant', () => {
      expect(holderLegalFormPreview('Col Pers', '')).toBe('Col Pers');
      expect(holderLegalFormPreview('', 'M.')).toBe('M.');
      expect(holderLegalFormPreview('', '')).toBe('');
    });
  });
});
