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
