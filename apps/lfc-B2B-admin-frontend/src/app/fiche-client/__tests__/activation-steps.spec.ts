import type { PlatformSettings } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { activationSteps, missingRequiredPieces } from '../informations/activation-steps';

const ALL_REQUIRED: PlatformSettings = {
  tva: 'required',
  kbis: 'required',
  billing: 'required',
  delivery: 'required',
};

/** Une société dont tout est fait — on retire ensuite ce qu'on veut tester. */
function complete(overrides: Partial<AdminCompanyDetail> = {}): AdminCompanyDetail {
  return {
    id: 'cmp_1',
    reference: 'C-000001',
    raisonSociale: 'La Folie Douce',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '12345678901234',
    tvaIntracom: 'FR12345678901',
    status: 'pending',
    grantedTerms: [],
    requestedTerm: null,
    primaryContact: { id: null, firstName: 'A', lastName: 'B', fonction: '', email: '', phone: '' },
    owner: null,
    kbis: {
      fileName: 'kbis.pdf',
      uploadedAt: '2026-08-01T00:00:00.000Z',
      certified: true,
      certifiedAt: '2026-08-02T00:00:00.000Z',
      certifiedBy: { sub: 'staff|1', name: 'Camille Rousseau', role: 'commercial' },
    },
    hasOpenSupportRequest: false,
    fulfillmentPreference: { method: null, pickupAddressId: null, deliveryAddressId: null },
    createdAt: '2026-08-01T00:00:00.000Z',
    vatNumberRequired: true,
    contacts: [],
    addresses: {
      billing: { id: 'adr_1' } as AdminCompanyDetail['addresses']['billing'],
      deliveries: [{ id: 'adr_2' } as AdminCompanyDetail['addresses']['deliveries'][number]],
    },
    ...overrides,
  };
}

describe('activationSteps', () => {
  it('réclame TOUT quand la société n’existe pas encore', () => {
    // C'est le mode ouverture : le commercial doit voir dès maintenant ce qu'il
    // aura à demander, pas le découvrir pièce par pièce.
    expect(activationSteps(null, ALL_REQUIRED).map((s) => s.key)).toEqual([
      'legal',
      'tva',
      'kbis',
      'billing',
      'delivery',
      'payment',
    ]);
  });

  it('ne garde que le règlement quand le dossier est complet', () => {
    expect(activationSteps(complete(), ALL_REQUIRED).map((s) => s.key)).toEqual(['payment']);
  });

  it('ne réclame pas une pièce que le service n’utilise pas', () => {
    const steps = activationSteps(complete({ addresses: { billing: null, deliveries: [] } }), {
      ...ALL_REQUIRED,
      delivery: 'hidden',
    });
    expect(steps.map((s) => s.key)).toEqual(['billing', 'payment']);
  });

  it("réclame l'identité légale d'un compte ouvert sans papiers", () => {
    // Elle n'est pas configurable : sans SIRET, il n'y a rien à facturer. Elle
    // ouvre donc la liste, avant les pièces.
    const steps = activationSteps(
      complete({ raisonSociale: '', siret: '', formeJuridique: '' }),
      ALL_REQUIRED,
    );
    expect(steps.map((s) => s.key)).toEqual(['legal', 'payment']);
  });

  it('ne réclame pas de TVA à un non-assujetti', () => {
    const steps = activationSteps(
      complete({ vatNumberRequired: false, tvaIntracom: '' }),
      ALL_REQUIRED,
    );
    expect(steps.map((s) => s.key)).toEqual(['payment']);
  });

  it('rend une liste vide quand le réglage est illisible', () => {
    // Fail-closed sur l'affichage : mieux vaut ne rien réclamer que réclamer des
    // pièces peut-être désactivées.
    expect(activationSteps(complete(), null)).toEqual([]);
  });
});

describe('missingRequiredPieces', () => {
  it('interdit d’activer un compte qui n’existe pas encore', () => {
    expect(missingRequiredPieces(null, ALL_REQUIRED)).toEqual([
      'tva',
      'kbis',
      'billing',
      'delivery',
    ]);
  });

  it('ignore une pièce seulement optionnelle', () => {
    const company = complete({ kbis: null });
    expect(missingRequiredPieces(company, { ...ALL_REQUIRED, kbis: 'optional' })).toEqual([]);
  });
});

describe('le KBIS ne compte que VÉRIFIÉ (même règle que le serveur)', () => {
  /** Déposé, mais que personne n'a ouvert. */
  const deposited = {
    fileName: 'kbis.pdf',
    uploadedAt: '2026-08-01T00:00:00.000Z',
    certified: false,
    certifiedAt: null,
    certifiedBy: null,
  };

  it('un extrait déposé mais non vérifié laisse la pièce MANQUANTE', () => {
    // Sinon l'écran allumerait « Activer le compte » et le serveur répondrait
    // 409 : un bouton qui promet ce que le serveur refuse est pire qu'un
    // bouton grisé.
    expect(missingRequiredPieces(complete({ kbis: deposited }), ALL_REQUIRED)).toContain('kbis');
    expect(
      activationSteps(complete({ kbis: deposited }), ALL_REQUIRED).map((s) => s.key),
    ).toContain('kbis');
  });

  it('vérifié ⇒ la pièce est acquise', () => {
    expect(missingRequiredPieces(complete(), ALL_REQUIRED)).not.toContain('kbis');
  });
});
