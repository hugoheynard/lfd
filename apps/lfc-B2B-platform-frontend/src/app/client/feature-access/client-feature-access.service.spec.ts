import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientFeatureAccess } from './client-feature-access.service';

/** Auth0 est la seule frontière doublée : un visiteur, ou une personne reconnue. */
function authAs(recognised: boolean): Pick<AuthFacade, 'authGate$' | 'accessToken$'> {
  return {
    authGate$: () => of(recognised),
    accessToken$: () => of('jeton-de-test'),
  };
}

describe('ClientFeatureAccess', () => {
  let access: ClientFeatureAccess;
  let http: HttpTestingController;

  function setUp(recognised: boolean): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: authAs(recognised) },
      ],
    });
    access = TestBed.inject(ClientFeatureAccess);
    http = TestBed.inject(HttpTestingController);
  }

  const globalRead = (r: { url: string }): boolean => r.url.endsWith('/feature-access');
  const mineRead = (r: { url: string }): boolean => r.url.endsWith('/feature-access/mine');

  afterEach(() => {
    http.verify();
  });

  describe('visiteur', () => {
    beforeEach(() => setUp(false));

    /** Tant qu'on ne sait pas, on ne promet rien : l'écran se comporte comme fermé. */
    it('se comporte comme `closed` pendant la lecture', async () => {
      const loading = access.load();

      expect(access.state()).toBe('loading');
      expect(access.shop()).toBe('closed');
      expect(access.atLeast('browse')).toBe(false);
      http.expectOne(globalRead).flush({ shop: 'order' });
      await loading;
    });

    it('lit les niveaux GLOBAUX, sans jeton, et applique « au moins »', async () => {
      const loading = access.load();
      const request = http.expectOne(globalRead);
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.has('Authorization')).toBe(false);
      http.expectNone(mineRead);

      request.flush({ shop: 'browse' });
      await loading;

      expect(access.state()).toBe('ready');
      expect(access.shop()).toBe('browse');
      expect(access.atLeast('closed')).toBe(true);
      expect(access.atLeast('browse')).toBe(true);
      expect(access.atLeast('order')).toBe(false);
    });

    /** Plan §4 : l'échec est une réponse, et la réponse prudente est « fermé ». */
    it('un échec de lecture vaut `closed`, et le dit', async () => {
      const loading = access.load();
      http.expectOne(globalRead).flush('panne', { status: 503, statusText: 'Service Unavailable' });
      await loading;

      expect(access.state()).toBe('failed');
      expect(access.shop()).toBe('closed');
      expect(access.levelOf('shop')).toBe('closed');
      expect(access.atLeast('browse')).toBe(false);
    });

    it('ne relit pas : deux appelants attendent la même lecture', async () => {
      const first = access.load();
      const second = access.load();
      http.expectOne(globalRead).flush({ shop: 'order' });
      await Promise.all([first, second]);

      expect(first).toBe(second);
    });

    /** Les gardes attendent ce signal : il doit se lever sur l'échec comme sur le succès. */
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

    /**
     * Une personne exemptée garde la boutique entière : ses niveaux ne sont pas
     * les niveaux globaux, et seul `/mine` les connaît.
     */
    it('lit SES niveaux par `/feature-access/mine`, avec son jeton', async () => {
      const loading = access.load();
      const request = http.expectOne(mineRead);
      expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
      http.expectNone(globalRead);

      request.flush({ shop: 'order' });
      await loading;

      expect(access.state()).toBe('ready');
      expect(access.atLeast('order')).toBe(true);
    });

    it('un échec de `/mine` vaut `closed`, comme la lecture globale', async () => {
      const loading = access.load();
      http.expectOne(mineRead).flush('panne', { status: 500, statusText: 'Server Error' });
      await loading;

      expect(access.state()).toBe('failed');
      expect(access.shop()).toBe('closed');
    });
  });
});
