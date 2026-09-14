import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import { AccountService } from './account.service';
import type { EstablishmentDraft } from './establishment';

const DRAFT: EstablishmentDraft = {
  firstName: 'Pierre',
  lastName: 'Marchand',
  phone: '06 12 44 09 87',
  enseigne: 'Brasserie Marchand',
};

/** Seule la porte pro est éprouvée ici : `declareEstablishment`. */
describe('AccountService — declareEstablishment', () => {
  let account: AccountService;
  let http: HttpTestingController;
  let toasts: { success: string[]; error: unknown[] };

  beforeEach(() => {
    toasts = { success: [], error: [] };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(false),
            authEmail: signal(null),
            accessToken$: () => of('jeton'),
          },
        },
        {
          provide: NotifyService,
          useValue: {
            success: (message: string) => toasts.success.push(message),
            error: (error: unknown) => toasts.error.push(error),
          },
        },
      ],
    });
    account = TestBed.inject(AccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const post = () => http.expectOne((r) => r.url.endsWith('/me/establishment'));
  const refuse = (code: string, message: string, status = 400): void => {
    post().flush({ code, message }, { status, statusText: 'Refus' });
  };

  it('poste les quatre champs avec le jeton, puis relit `/me`', async () => {
    const outcome = account.declareEstablishment(DRAFT);
    const request = post();
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(DRAFT);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');

    request.flush({ companyId: 'cmp_1' }, { status: 201, statusText: 'Created' });

    await expect(outcome).resolves.toEqual({ kind: 'declared' });
    http.expectOne((r) => r.url.endsWith('/me') && r.method === 'GET');
  });

  it('un 409 « déjà rattaché » relit `/me`, sans erreur ni toast', async () => {
    const outcome = account.declareEstablishment(DRAFT);
    refuse(
      'account.person.already_attached',
      'Votre compte est déjà rattaché à un établissement.',
      409,
    );

    await expect(outcome).resolves.toEqual({ kind: 'already-attached' });
    http.expectOne((r) => r.url.endsWith('/me'));
    expect(toasts.error).toEqual([]);
  });

  it.each([
    ['account.person_name.invalid', 'Prénom : obligatoire', 'firstName'],
    ['account.person_name.invalid', 'Nom : obligatoire', 'lastName'],
    ['account.phone.invalid', 'Téléphone « 12 » : au moins 6 chiffres', 'phone'],
    ['account.company.invalid', 'Enseigne : obligatoire', 'enseigne'],
    ['account.company.invalid', 'Raison sociale : obligatoire', null],
    ['account.something_else', 'Autre chose', null],
  ])('rattache %s « %s » au champ %s, sans toast ni relecture', async (code, message, field) => {
    const outcome = account.declareEstablishment(DRAFT);
    refuse(code, message);

    await expect(outcome).resolves.toEqual({ kind: 'refused', field, message });
    expect(toasts.error).toEqual([]);
  });
});

/**
 * Les écritures de `/mon-compte` qui rendent le refus au panneau : détenteur,
 * contact, retrait, profil. Chacune est éprouvée sur les trois faits qui
 * comptent pour l'écran — la requête exacte, `null` + relecture au succès, le
 * message du serveur sans relecture à l'échec.
 */
describe('AccountService — écritures à refus rendu', () => {
  let account: AccountService;
  let http: HttpTestingController;
  let toasts: { success: string[]; error: unknown[] };

  beforeEach(() => {
    toasts = { success: [], error: [] };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(false),
            authEmail: signal(null),
            accessToken$: () => of('jeton'),
          },
        },
        {
          provide: NotifyService,
          useValue: {
            success: (message: string) => toasts.success.push(message),
            error: (error: unknown) => toasts.error.push(error),
          },
        },
      ],
    });
    account = TestBed.inject(AccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const HOLDER = {
    firstName: 'Hugo',
    lastName: 'Heynard',
    fonction: 'Directeur',
    email: 'hheynard@gmail.com',
    phone: '06 12 44 08 71',
  };
  const CONTACT = { ...HOLDER, email: 'compta@cabinet-ferrand.fr', role: 'billing' as const };
  const PROFILE = { firstName: 'Hugo', lastName: 'Heynard', email: 'hugo@lfd.fr', phone: '' };

  /** Les quatre écritures, chacune avec la requête qu'elle doit émettre. */
  const CASES = [
    {
      name: 'saveHolder',
      call: (): Promise<string | null> => account.saveHolder('cmp_1', HOLDER),
      method: 'PATCH',
      path: '/companies/cmp_1/contact',
      body: HOLDER,
    },
    {
      name: 'saveContactEdit',
      call: (): Promise<string | null> => account.saveContactEdit('cmp_1', 'ct_1', CONTACT),
      method: 'PATCH',
      path: '/companies/cmp_1/contacts/ct_1',
      body: CONTACT,
    },
    {
      name: 'deleteContact',
      call: (): Promise<string | null> => account.deleteContact('cmp_1', 'ct_1'),
      method: 'DELETE',
      path: '/companies/cmp_1/contacts/ct_1',
      body: null,
    },
    {
      name: 'saveMyProfile',
      call: (): Promise<string | null> => account.saveMyProfile(PROFILE),
      method: 'PATCH',
      path: '/me/profile',
      body: PROFILE,
    },
  ] as const;

  for (const c of CASES) {
    describe(c.name, () => {
      const request = () => http.expectOne((r) => r.url.endsWith(c.path));

      it(`émet ${c.method} ${c.path} avec le corps exact et le jeton`, async () => {
        const outcome = c.call();
        await Promise.resolve();
        const sent = request();
        expect(sent.request.method).toBe(c.method);
        expect(sent.request.body).toEqual(c.body);
        expect(sent.request.headers.get('Authorization')).toBe('Bearer jeton');

        sent.flush(null, { status: 204, statusText: 'No Content' });
        await outcome;
        http.expectOne((r) => r.url.endsWith('/me') && r.method === 'GET');
      });

      it('rend `null` au succès, toaste la réussite et relit `/me`', async () => {
        const outcome = c.call();
        request().flush(null, { status: 204, statusText: 'No Content' });

        await expect(outcome).resolves.toBeNull();
        expect(toasts.success.length).toBe(1);
        expect(toasts.error).toEqual([]);
        http.expectOne((r) => r.url.endsWith('/me') && r.method === 'GET');
      });

      it('rend le message du serveur à l’échec, sans relire `/me`', async () => {
        const outcome = c.call();
        request().flush(
          { code: 'account.refused', message: 'Refus nommé par le serveur.' },
          { status: 409, statusText: 'Conflict' },
        );

        await expect(outcome).resolves.toBe('Refus nommé par le serveur.');
        expect(toasts.success).toEqual([]);
        expect(toasts.error.length).toBe(1);
        http.expectNone((r) => r.url.endsWith('/me'));
        // Le statut de page ne bouge pas : le panneau ouvert n'est pas détruit.
        expect(account.status()).toBe('idle');
      });
    });
  }

  /** Le détenteur n'a pas de rôle à choisir : un rôle glissé dans le corps serait un mensonge. */
  it('saveHolder n’envoie aucun rôle', async () => {
    const outcome = account.saveHolder('cmp_1', HOLDER);
    const sent = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/contact'));
    expect(Object.keys(sent.request.body as object)).not.toContain('role');
    sent.flush(null);
    await outcome;
    http.expectOne((r) => r.url.endsWith('/me'));
  });
});
