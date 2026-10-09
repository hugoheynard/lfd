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

      access.receive({ customerMandate: 'open', facebookLogin: 'hidden' });
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

      access.receive({ customerMandate: 'closed', facebookLogin: 'visible' });
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

    it('lit SES niveaux par `/feature-access/mine`, avec son jeton', async () => {
      const loading = access.load();
      const request = http.expectOne(mineRead);
      expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
      http.expectNone(globalRead);

      request.flush({ customerMandate: 'open' });
      await loading;

      expect(access.state()).toBe('ready');
      expect(access.customerMandate()).toBe('open');
    });

    it('un échec de `/mine` vaut `closed`, comme la lecture globale', async () => {
      const loading = access.load();
      http.expectOne(mineRead).flush('panne', { status: 500, statusText: 'Server Error' });
      await loading;

      expect(access.state()).toBe('failed');
      expect(access.customerMandate()).toBe('closed');
    });
  });
});
