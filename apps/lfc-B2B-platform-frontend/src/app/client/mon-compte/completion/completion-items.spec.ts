import type { ActivationGate, CompanyView } from '@lfd/contracts';

import { FR } from '../../copy/fr';
import { asRole, TOMMEUSES } from '../account.fixture';
import {
  type CompletionFacts,
  completionCount,
  completionFor,
  completionItems,
  completionSteps,
} from './completion-items';

const COPY = FR.account;
const TEXTS = COPY.completion.items;

/** Un verdict sans rien à redire, KBIS certifié. */
const CLEAN: ActivationGate = {
  canActivate: false,
  blocking: [],
  checklist: [
    { piece: 'vat', blocking: true, done: true },
    { piece: 'kbis', blocking: false, done: true },
    { piece: 'billing', blocking: true, done: true },
  ],
};

function facts(overrides: Partial<CompletionFacts> = {}): CompletionFacts {
  return {
    gate: CLEAN,
    company: TOMMEUSES,
    deliveryCount: 0,
    mintBlockers: [],
    mandateShown: false,
    mandateActive: false,
    ...overrides,
  };
}

function gate(overrides: Partial<ActivationGate>): ActivationGate {
  return { ...CLEAN, ...overrides };
}

const keys = (f: CompletionFacts): readonly string[] =>
  completionItems(f, COPY).map((item) => item.key);

describe('completionItems — la table du plan §2.2', () => {
  it('sans verdict lu, tait les lignes du verdict et garde celles qui n’en dépendent pas', () => {
    expect(
      keys(
        facts({
          gate: null,
          company: {
            ...TOMMEUSES,
            kbis: null,
            fulfillmentPreference: { ...TOMMEUSES.fulfillmentPreference, method: 'delivery' },
          },
          mintBlockers: ['siren_missing', 'holder_legal_form_missing'],
          mandateShown: true,
        }),
      ),
    ).toEqual(['identity', 'delivery', 'bank']);
  });

  it('sans verdict lu, la ligne identité ne porte que le mandat, non bloquante', () => {
    const [item] = completionItems(
      facts({ gate: null, mintBlockers: ['siren_missing'], mandateShown: true }),
      COPY,
    );
    expect(item?.blocking).toBe(false);
    expect(item?.detail).not.toContain(TEXTS.identity.detail);
  });

  it('ne dit rien quand rien ne manque', () => {
    expect(keys(facts())).toEqual([]);
  });

  it('identité légale : `identite_legale` bloque, dans la carte identité', () => {
    const [item] = completionItems(facts({ gate: gate({ blocking: ['identite_legale'] }) }), COPY);
    expect(item).toEqual({
      key: 'identity',
      title: TEXTS.identity.title,
      detail: TEXTS.identity.detail,
      action: TEXTS.identity.action,
      card: 'identity',
      target: 'identity',
      blocking: true,
    });
  });

  it('SIREN et raison sociale du mandat : la ligne identité, non bloquante', () => {
    const [item, ...rest] = completionItems(
      facts({ mintBlockers: ['siren_missing', 'company_name_missing'], mandateShown: true }),
      COPY,
    );
    expect(rest).toEqual([]);
    expect(item?.key).toBe('identity');
    expect(item?.blocking).toBe(false);
    expect(item?.detail).toContain(COPY.mandateBlockers.siren_missing);
    expect(item?.detail).toContain(COPY.mandateBlockers.company_name_missing);
  });

  it('SIREN et raison sociale du mandat : rien sans section mandat, rien sous un mandat actif', () => {
    const mint = ['siren_missing', 'company_name_missing'] as const;
    expect(keys(facts({ mintBlockers: mint, mandateShown: false }))).toEqual([]);
    expect(keys(facts({ mintBlockers: mint, mandateShown: true, mandateActive: true }))).toEqual(
      [],
    );
  });

  it('fusionne l’identité légale et le SIREN du mandat en UNE ligne', () => {
    const items = completionItems(
      facts({
        gate: gate({ blocking: ['identite_legale'] }),
        mintBlockers: ['siren_missing'],
        mandateShown: true,
      }),
      COPY,
    );
    expect(items.map((item) => item.key)).toEqual(['identity']);
    expect(items[0]?.blocking).toBe(true);
    expect(items[0]?.detail).toContain(TEXTS.identity.detail);
    expect(items[0]?.detail).toContain(COPY.mandateBlockers.siren_missing);
  });

  it('numéro de TVA : `vat` bloque, dans la carte identité', () => {
    const [item] = completionItems(facts({ gate: gate({ blocking: ['vat'] }) }), COPY);
    expect(item).toMatchObject({
      key: 'vat',
      card: 'identity',
      target: 'identity',
      blocking: true,
    });
  });

  it('numéro joignable : `telephone` bloque, dans la carte utilisateurs', () => {
    const [item] = completionItems(facts({ gate: gate({ blocking: ['telephone'] }) }), COPY);
    expect(item).toMatchObject({
      key: 'telephone',
      card: 'users',
      target: 'contacts',
      blocking: true,
    });
  });

  it('adresse de facturation : `facturation` bloque, dans la carte adresses', () => {
    const [item] = completionItems(facts({ gate: gate({ blocking: ['facturation'] }) }), COPY);
    expect(item).toMatchObject({
      key: 'billing',
      card: 'addresses',
      target: 'billing',
      blocking: true,
      action: TEXTS.billing.action,
    });
  });

  it('`detenteur` ne s’affiche jamais : celui qui lit est déjà rattaché', () => {
    expect(keys(facts({ gate: gate({ blocking: ['detenteur'] }) }))).toEqual([]);
  });

  describe('adresse de livraison', () => {
    const delivering = (company: CompanyView = TOMMEUSES): CompanyView => ({
      ...company,
      fulfillmentPreference: { ...company.fulfillmentPreference, method: 'delivery' },
    });

    it('manque quand on préfère la livraison et qu’aucune n’est déclarée', () => {
      const [item] = completionItems(facts({ company: delivering() }), COPY);
      expect(item).toMatchObject({
        key: 'delivery',
        card: 'addresses',
        target: 'delivery',
        blocking: false,
      });
    });

    it('ne manque pas avec une livraison déclarée', () => {
      expect(keys(facts({ company: delivering(), deliveryCount: 1 }))).toEqual([]);
    });

    it('ne manque pas sans préférence, ni au retrait', () => {
      expect(keys(facts())).toEqual([]);
      const pickup: CompanyView = {
        ...TOMMEUSES,
        fulfillmentPreference: { ...TOMMEUSES.fulfillmentPreference, method: 'pickup' },
      };
      expect(keys(facts({ company: pickup }))).toEqual([]);
    });

    it('n’offre pas de geste à un rôle qui n’écrit pas le carnet', () => {
      const [item] = completionItems(facts({ company: delivering(asRole('billing')) }), COPY);
      expect(item?.action).toBe('');
    });
  });

  describe('extrait KBIS', () => {
    const uncertified = gate({
      checklist: CLEAN.checklist.map((check) =>
        check.piece === 'kbis' ? { ...check, done: false } : check,
      ),
    });

    it('manque, non bloquant, quand aucun extrait n’est déposé', () => {
      const [item] = completionItems(
        facts({ gate: uncertified, company: { ...TOMMEUSES, kbis: null } }),
        COPY,
      );
      expect(item).toMatchObject({ key: 'kbis', card: 'kbis', target: 'kbis', blocking: false });
    });

    it('ne manque pas quand un extrait est déposé, même non certifié', () => {
      const filed: CompanyView = {
        ...TOMMEUSES,
        kbis: { fileName: 'kbis.pdf', uploadedAt: '2026-02-12T00:00:00.000Z', certified: false },
      };
      expect(keys(facts({ gate: uncertified, company: filed }))).toEqual([]);
    });
  });

  describe('RIB et forme juridique du titulaire', () => {
    const mint = { mintBlockers: ['holder_legal_form_missing'] } as const;

    it('manquent quand la section mandat est montrée sans mandat actif', () => {
      const [item] = completionItems(facts({ ...mint, mandateShown: true }), COPY);
      expect(item).toMatchObject({ key: 'bank', card: 'bank', target: 'bank', blocking: false });
      expect(item?.detail).toContain(COPY.mandateBlockers.holder_legal_form_missing);
    });

    it('ne manquent pas quand la section mandat n’est pas montrée', () => {
      expect(keys(facts({ ...mint, mandateShown: false }))).toEqual([]);
    });

    it('ne manquent pas sous un mandat actif', () => {
      expect(keys(facts({ ...mint, mandateShown: true, mandateActive: true }))).toEqual([]);
    });
  });

  it('`issuer_missing` n’est jamais montré : ce n’est pas au client d’agir', () => {
    expect(keys(facts({ mintBlockers: ['issuer_missing'], mandateShown: true }))).toEqual([]);
  });

  it('suit l’ordre de la table', () => {
    expect(
      keys(
        facts({
          gate: {
            canActivate: false,
            blocking: ['facturation', 'telephone', 'vat', 'identite_legale'],
            checklist: [{ piece: 'kbis', blocking: false, done: false }],
          },
          company: {
            ...TOMMEUSES,
            kbis: null,
            fulfillmentPreference: { ...TOMMEUSES.fulfillmentPreference, method: 'delivery' },
          },
          mintBlockers: ['bank_account_missing'],
          mandateShown: true,
        }),
      ),
    ).toEqual(['identity', 'vat', 'telephone', 'billing', 'delivery', 'kbis', 'bank']);
  });
});

describe('completionSteps', () => {
  const items = completionItems(
    facts({
      gate: {
        canActivate: false,
        blocking: ['vat'],
        checklist: [{ piece: 'kbis', blocking: false, done: false }],
      },
      company: { ...TOMMEUSES, kbis: null },
    }),
    COPY,
  );

  it('en attente, dit qu’une ligne bloquante empêche l’activation', () => {
    const [vat, kbis] = completionSteps(items, true, COPY);
    expect(vat?.detail).toBe(
      COPY.completion.blocksActivation.replace('{detail}', TEXTS.vat.detail),
    );
    expect(vat?.blocking).toBe(true);
    expect(kbis?.detail).toBe(TEXTS.kbis.detail);
    expect(kbis?.blocking).toBe(false);
  });

  it('hors attente, aucune ligne ne parle d’activation', () => {
    for (const step of completionSteps(items, false, COPY)) {
      expect(step.detail).not.toContain('activation');
      expect('blocking' in step).toBe(false);
    }
  });

  it('reprend le geste de l’élément, en action', () => {
    expect(completionSteps(items, false, COPY).map((step) => [step.cta, step.kind])).toEqual([
      [TEXTS.vat.action, 'action'],
      [TEXTS.kbis.action, 'action'],
    ]);
  });
});

describe('completionCount et completionFor', () => {
  it('accorde la synthèse', () => {
    expect(completionCount(1, COPY)).toBe('1 élément à compléter');
    expect(completionCount(3, COPY)).toBe('3 éléments à compléter');
  });

  it('ne rend que les éléments de la carte', () => {
    const items = completionItems(
      facts({ gate: gate({ blocking: ['identite_legale', 'vat', 'telephone'] }) }),
      COPY,
    );
    expect(completionFor(items, 'identity').map((item) => item.key)).toEqual(['identity', 'vat']);
    expect(completionFor(items, 'kbis')).toEqual([]);
  });
});
