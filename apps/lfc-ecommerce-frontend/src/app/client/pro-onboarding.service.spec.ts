import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { AccountStatus } from '../account/account.service';
import { AccountService } from '../account/account.service';
import type { DeclarationOutcome, EstablishmentDraft } from '../account/establishment';
import { AuthFacade, type ProRegistration } from '../auth/auth.facade';
import { ProOnboarding } from './pro-onboarding.service';

const REGISTRATION: ProRegistration = {
  firstName: 'Pierre',
  lastName: 'Marchand',
  email: 'pierre@brasserie-marchand.fr',
  phone: '06 12 44 09 87',
  enseigne: 'Brasserie Marchand',
};

const DRAFT: EstablishmentDraft = {
  firstName: 'Pierre',
  lastName: 'Marchand',
  phone: '06 12 44 09 87',
  enseigne: 'Brasserie Marchand',
};

describe('ProOnboarding', () => {
  let pending: ReturnType<typeof signal<ProRegistration | null>>;
  let authenticated: ReturnType<typeof signal<boolean>>;
  let status: ReturnType<typeof signal<AccountStatus>>;
  let companies: ReturnType<typeof signal<readonly { id: string }[]>>;
  let calls: EstablishmentDraft[];
  let release: (outcome: DeclarationOutcome) => void;
  let onboarding: ProOnboarding;

  beforeEach(() => {
    pending = signal<ProRegistration | null>(null);
    authenticated = signal(false);
    status = signal<AccountStatus>('idle');
    companies = signal<readonly { id: string }[]>([]);
    calls = [];
    const account = {
      status,
      companies,
      hasNoCompany: computed(() => status() === 'ready' && companies().length === 0),
      declareEstablishment: (draft: EstablishmentDraft): Promise<DeclarationOutcome> => {
        calls.push(draft);
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthFacade,
          useValue: { pendingProRegistration: pending, isAuthenticated: authenticated },
        },
        { provide: AccountService, useValue: account },
      ],
    });
    onboarding = TestBed.inject(ProOnboarding);
  });

  /** Le retour d'Auth0 : la personne est reconnue, `/me` a répondu, la déclaration revient. */
  const comeBack = (): void => {
    authenticated.set(true);
    status.set('ready');
    pending.set(REGISTRATION);
    TestBed.tick();
  };

  it('déclare UNE fois, sans e-mail, et vide la déclaration rapportée', () => {
    comeBack();

    expect(calls).toEqual([DRAFT]);
    expect(pending()).toBeNull();
    expect(onboarding.declaring()).toBe(true);
  });

  it('attend la personne reconnue et la lecture de `/me` avant de déclarer', () => {
    pending.set(REGISTRATION);
    TestBed.tick();
    authenticated.set(true);
    status.set('loading');
    TestBed.tick();
    expect(calls).toEqual([]);

    status.set('ready');
    TestBed.tick();
    expect(calls).toHaveLength(1);
  });

  /** Un rechargement qui rejouerait l'`appState` ne redéclare pas. */
  it('ne rejoue pas la déclaration', async () => {
    comeBack();
    release({ kind: 'declared' });
    await Promise.resolve();

    pending.set(REGISTRATION);
    status.set('loading');
    TestBed.tick();
    status.set('ready');
    TestBed.tick();

    expect(calls).toHaveLength(1);
  });

  it('ne crée rien si `/me` dit déjà une société', () => {
    companies.set([{ id: 'cmp_1' }]);
    comeBack();

    expect(calls).toEqual([]);
    expect(pending()).toBeNull();
  });

  /** Plan §3.2 : double clic, second onglet, rejeu — tous finissent dans le même état. */
  it('un « déjà rattaché » ne montre aucune erreur', async () => {
    comeBack();
    release({ kind: 'already-attached' });
    await Promise.resolve();

    expect(onboarding.declaring()).toBe(false);
    expect(onboarding.lastError()).toBeNull();
    expect(onboarding.returnedDraft()).toBeNull();
  });

  it('un refus rend les champs à la carte, avec son erreur', async () => {
    comeBack();
    release({ kind: 'refused', field: 'lastName', message: 'Nom : obligatoire' });
    await Promise.resolve();

    expect(onboarding.declaring()).toBe(false);
    expect(onboarding.lastError()).toEqual({
      kind: 'refused',
      field: 'lastName',
      message: 'Nom : obligatoire',
    });
    expect(onboarding.returnedDraft()).toEqual(DRAFT);

    onboarding.clearFailure();
    expect(onboarding.lastError()).toBeNull();
  });

  it('ne réclame la carte que sans société ET sans déclaration en route', async () => {
    authenticated.set(true);
    status.set('ready');
    expect(onboarding.needsDossier()).toBe(true);

    pending.set(REGISTRATION);
    expect(onboarding.needsDossier()).toBe(false);

    TestBed.tick();
    expect(onboarding.declaring()).toBe(true);
    expect(onboarding.needsDossier()).toBe(false);

    release({ kind: 'refused', field: null, message: 'Serveur injoignable.' });
    await Promise.resolve();
    expect(onboarding.needsDossier()).toBe(true);

    companies.set([{ id: 'cmp_1' }]);
    expect(onboarding.needsDossier()).toBe(false);
  });
});
