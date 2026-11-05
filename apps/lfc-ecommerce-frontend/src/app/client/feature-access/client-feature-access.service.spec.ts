import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import type { Account } from '../../account/account.model';
import { AccountService, type AccountStatus } from '../../account/account.service';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientFeatureAccess } from './client-feature-access.service';

/** Auth0 est la seule frontière doublée : un visiteur, ou une personne reconnue. */
function authAs(recognised: boolean): Pick<AuthFacade, 'authGate$' | 'accessToken$'> {
  return {
    authGate$: () => of(recognised),
    accessToken$: () => of('jeton-de-test'),
  };
}

/** Le compte de `GET /me` : seuls `account` et `status` sont lus par le service. */
const accountState = {
  account: signal<Account | null>(null),
  status: signal<AccountStatus>('idle'),
};
const accountsDouble: Pick<AccountService, 'account' | 'status'> = {
  account: accountState.account.asReadonly(),
  status: accountState.status.asReadonly(),
};

/** Un compte sans société ; le service n'en lit que les niveaux. */
function accountWith(levels: Account['featureLevels']): Account {
  return {
    profile: {
      userId: 'usr_1',
      firstName: 'Léa',
      lastName: 'Martin',
      email: 'lea@exemple.fr',
      phone: '',
    },
    companies: [],
    reachableSites: [],
    navPrefs: { catalogueView: null, workspace: null },
    featureLevels: levels,
  };
}

describe('ClientFeatureAccess', () => {
  let access: ClientFeatureAccess;
  let http: HttpTestingController;

  function setUp(recognised: boolean): void {
    TestBed.resetTestingModule();
    accountState.account.set(null);
    accountState.status.set('idle');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: authAs(recognised) },
        { provide: AccountService, useValue: accountsDouble },
      ],
    });
    access = TestBed.inject(ClientFeatureAccess);
    http = TestBed.inject(HttpTestingController);
  }

  const globalRead = (r: { url: string }): boolean => r.url.endsWith('/feature-access');
  const mineRead = (r: { url: string }): boolean => r.url.includes('/feature-access/mine');

  afterEach(() => {
    http.verify();
  });

  describe('visiteur', () => {
    beforeEach(() => setUp(false));

    it('lit les niveaux GLOBAUX, sans jeton', async () => {
      const loading = access.load();
      expect(access.state()).toBe('loading');
      const request = http.expectOne(globalRead);
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.has('Authorization')).toBe(false);
      http.expectNone(mineRead);

      request.flush({ customerMandate: 'open' });
      await loading;

      expect(access.state()).toBe('ready');
      expect(access.customerMandate()).toBe('open');
    });

    /**
     * Plan mandat client §8 : la clé est gardée par l'API et fermée par défaut.
     * Une carte montrée sur une lecture en vol, en échec ou muette n'enverrait
     * que des requêtes refusées.
     */
    it('le mandat client reste `closed` tant qu’on ne sait pas, et suit le serveur ensuite', async () => {
      const loading = access.load();
      expect(access.customerMandate()).toBe('closed');
      http.expectOne(globalRead).flush({});
      await loading;
      // Un serveur qui ne connaît pas la clé : fermé.
      expect(access.customerMandate()).toBe('closed');

      access.receive({
        customerMandate: 'open',
        facebookLogin: 'hidden',
        proSignupCallback: 'hidden',
      });
      expect(access.customerMandate()).toBe('open');
    });

    /** 2026-10-09 : le bouton Facebook est masqué tant qu'on ne sait pas, et en échec. */
    it('masque Facebook tant qu’on ne sait pas, et suit le serveur ensuite', async () => {
      const loading = access.load();
      expect(access.facebookLoginShown()).toBe(false);
      http.expectOne(globalRead).flush({ customerMandate: 'closed' });
      await loading;
      // Un serveur qui ne connaît pas la clé : masqué.
      expect(access.facebookLoginShown()).toBe(false);

      access.receive({
        customerMandate: 'closed',
        facebookLogin: 'visible',
        proSignupCallback: 'hidden',
      });
      expect(access.facebookLoginShown()).toBe(true);
    });

    it('un échec de lecture masque Facebook', async () => {
      const loading = access.load();
      http.expectOne(globalRead).flush('panne', { status: 503, statusText: 'Service Unavailable' });
      await loading;

      expect(access.state()).toBe('failed');
      expect(access.facebookLoginShown()).toBe(false);
    });

    /** L'échec est une réponse, et la réponse prudente est « fermé ». */
    it('un échec de lecture ferme le mandat client, et le dit', async () => {
      const loading = access.load();
      http.expectOne(globalRead).flush('panne', { status: 503, statusText: 'Service Unavailable' });
      await loading;

      expect(access.state()).toBe('failed');
      expect(access.customerMandate()).toBe('closed');
    });

    it('ne relit pas : deux appelants attendent la même lecture', async () => {
      const first = access.load();
      const second = access.load();
      http.expectOne(globalRead).flush({ customerMandate: 'closed' });
      await Promise.all([first, second]);

      expect(first).toBe(second);
    });

    /** Qui attend ce signal doit le voir se lever sur l'échec comme sur le succès. */
    it('`settled()` résout après un échec — jamais d’attente infinie', async () => {
      let settled = false;
      void access.settled().then(() => {
        settled = true;
      });
      void access.load();
      await Promise.resolve();
      expect(settled).toBe(false);

      http.expectOne(globalRead).error(new ProgressEvent('offline'));
      await access.settled();

      expect(settled).toBe(true);
    });
  });

  describe('personne reconnue', () => {
    beforeEach(() => setUp(true));

    const LEVELS = {
      customerMandate: 'open',
      facebookLogin: 'visible',
      proSignupCallback: 'hidden',
    } as const;

    /** 2026-11-05 : les niveaux voyagent dans `GET /me` ; plus de requête à part. */
    it('lit SES niveaux dans le compte de `/me`, sans aucune requête de plus', async () => {
      const loading = access.load();
      TestBed.tick();
      expect(access.state()).toBe('loading');

      accountState.status.set('ready');
      accountState.account.set(accountWith(LEVELS));
      TestBed.tick();
      await loading;

      http.expectNone(mineRead);
      http.expectNone(globalRead);
      expect(access.state()).toBe('ready');
      expect(access.customerMandate()).toBe('open');
      expect(access.facebookLoginShown()).toBe(true);
    });

    it('un échec de `/me` vaut `closed`, comme la lecture globale', async () => {
      const loading = access.load();
      accountState.status.set('error');
      TestBed.tick();
      await loading;

      expect(access.state()).toBe('failed');
      expect(access.customerMandate()).toBe('closed');
    });
  });
});
