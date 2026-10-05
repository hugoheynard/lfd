import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { FicheClientActions } from '../informations/fiche-client.actions';
import { FicheClientFacade } from '../informations/fiche-client.facade';
import { FicheClientPanels } from '../informations/fiche-client.panels';
import { FicheClientStore } from '../informations/fiche-client.store';

const COMPANY: AdminCompanyDetail = {
  activation: null,
  gate: { canActivate: false, blocking: [], checklist: [] },
  suspensionCause: null,
  id: 'cmp_1',
  reference: 'C-ADM001',
  raisonSociale: 'Café des Halles SAS',
  enseigne: '',
  formeJuridique: 'SAS',
  siret: '81245678900021',
  siren: '',
  vatNumber: '',
  status: 'pending',
  grantedTerms: [],
  requestedTerm: null,
  directDebitBlocked: false,
  primaryContact: {
    id: null,
    role: null,
    firstName: 'Camille',
    lastName: 'Rousseau',
    fonction: 'Gérante',
    email: 'gerant@halles.fr',
    phone: '',
  },
  kbis: null,
  owner: null,
  hasOpenSupportRequest: false,
  parent: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  activatedAt: null,
  warnings: [],
  vatNumberRequired: true,
  hierarchy: { parent: null, subAccounts: [], follows: [], groupWithoutDelivery: false },
  addresses: { billing: null, deliveries: [] },
  contacts: [],
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
};

/**
 * Les trois collaborateurs sont doublés en HÉRITANT d'eux : la façade lit
 * leurs signaux au champ, et un objet partiel laissait ces champs à
 * `undefined` sans que rien ne le dise. Leurs dépendances HTTP sont montées
 * sur le backend de test ; aucune n'est appelée, puisque ce qui les touche est
 * redéfini ici.
 */
class CountingStore extends FicheClientStore {
  loads = 0;

  override load(): Promise<void> {
    this.loads += 1;
    this.company.set(COMPANY);
    return Promise.resolve();
  }
}

class ScriptedActions extends FicheClientActions {
  succeeds = true;

  override activate(): Promise<boolean> {
    return Promise.resolve(this.succeeds);
  }
}

class RecordingPanels extends FicheClientPanels {
  closes = true;

  override openStep(key: string): Promise<unknown> | null {
    openedSteps.push(key);
    return this.closes ? Promise.resolve() : null;
  }
}

/** Les clés d'étape demandées aux panneaux, dans l'ordre. */
let openedSteps: string[] = [];

interface Harness {
  readonly facade: FicheClientFacade;
  readonly loads: () => number;
  readonly store: FicheClientStore;
}

/** Le doublé fourni sous le jeton du collaborateur réel, sous son propre type. */
function injected<T, D extends T>(token: abstract new () => T, double: abstract new () => D): D {
  const instance = TestBed.inject(token);
  if (!(instance instanceof double)) {
    throw new Error(`Le doublé ${double.name} n’a pas été fourni.`);
  }
  return instance;
}

/**
 * La façade seule, ses trois collaborateurs doublés : ce qu'on éprouve ici,
 * c'est **la couture** — qui recharge quoi, et quand.
 */
function setup(
  options: {
    readonly succeeds?: boolean;
    readonly panelCloses?: boolean;
  } = {},
): Harness {
  openedSteps = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      FicheClientFacade,
      { provide: FicheClientStore, useClass: CountingStore },
      { provide: FicheClientActions, useClass: ScriptedActions },
      { provide: FicheClientPanels, useClass: RecordingPanels },
    ],
  });
  const store = injected(FicheClientStore, CountingStore);
  store.company.set(COMPANY);
  injected(FicheClientActions, ScriptedActions).succeeds = options.succeeds ?? true;
  injected(FicheClientPanels, RecordingPanels).closes = options.panelCloses !== false;

  return { facade: TestBed.inject(FicheClientFacade), loads: () => store.loads, store };
}

describe('façade — un geste réussi recharge la fiche', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('recharge après une mutation qui a tenu', async () => {
    // La couture est écrite ICI, une seule fois : chaque méthode de la page la
    // réécrivait, et il suffisait d'en oublier une pour que l'écran mente.
    const { facade, loads } = setup({ succeeds: true });

    await facade.activate();

    expect(loads()).toBe(1);
  });

  it('NE recharge PAS quand le geste a échoué', async () => {
    // Un échec laisse l'écran tel quel : recharger dessus effacerait ce que le
    // commercial avait sous les yeux au moment du refus.
    const { facade, loads } = setup({ succeeds: false });

    await facade.activate();

    expect(loads()).toBe(0);
  });
});

describe('façade — un panneau fermé recharge la fiche', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('recharge à la fermeture, quoi qu’il s’y soit passé', async () => {
    // On ne sait pas ce que le panneau a écrit : la seule réponse honnête est
    // de relire.
    const { facade, loads } = setup({});

    facade.openStep('vat');
    await Promise.resolve();
    await Promise.resolve();

    expect(loads()).toBe(1);
  });

  it('ne recharge pas quand l’étape n’a AUCUN panneau', async () => {
    // Le KBIS est un dépôt de fichier, le règlement se règle sur la fiche :
    // rien ne s'est ouvert, donc rien n'a changé.
    const { facade, loads } = setup({ panelCloses: false });

    facade.openStep('kbis');
    await Promise.resolve();

    expect(loads()).toBe(0);
  });
});

describe('façade — « Modifier » l’identité', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  /**
   * Régression : la carte d'identité demandait l'étape `tva`, que les panneaux
   * ne servent plus depuis le passage à `vat` — le clic n'ouvrait rien (2026-09-14).
   */
  it('demande l’étape que le panneau d’identité sert', () => {
    const { facade } = setup();

    facade.editIdentity();

    expect(openedSteps).toEqual(['vat']);
  });
});
