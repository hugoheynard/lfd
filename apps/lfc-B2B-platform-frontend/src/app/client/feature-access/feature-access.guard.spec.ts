import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import type { ShopLevel } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientFeatureAccess } from './client-feature-access.service';
import { featureAccessGuard } from './feature-access.guard';
import { ALL_VISIBLE } from './feature-access.fixture';

/** Le routeur ne lit ni la route ni l'état : la garde ne dépend que du niveau. */
const ROUTE = {} as ActivatedRouteSnapshot;
const STATE = {} as RouterStateSnapshot;

function boot(signedIn: boolean): ClientFeatureAccess {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthFacade, useValue: { authGate$: () => of(signedIn) } },
      // La lecture réseau n'est pas le sujet : les niveaux sont posés à la main.
      { provide: ClientFeatureAccess, useFactory: stubAccess },
    ],
  });
  return TestBed.inject(ClientFeatureAccess);
}

/** Le vrai service, dont la lecture ne part jamais : c'est le test qui répond. */
function stubAccess(): ClientFeatureAccess {
  const access = new ClientFeatureAccess();
  access.load = () => Promise.resolve();
  return access;
}

/** Où la garde envoie : `true`, ou l'adresse de renvoi. */
async function run(required: ShopLevel): Promise<true | string> {
  const result = await TestBed.runInInjectionContext(() =>
    featureAccessGuard('shop', required)(ROUTE, STATE),
  );
  if (result instanceof UrlTree) {
    return TestBed.inject(Router).serializeUrl(result);
  }
  expect(result).toBe(true);
  return true;
}

describe('featureAccessGuard', () => {
  /** Plan §4 : la table des niveaux, lue ligne par ligne. */
  const TABLE: readonly {
    readonly level: ShopLevel;
    readonly browse: boolean;
    readonly order: boolean;
  }[] = [
    { level: 'closed', browse: false, order: false },
    { level: 'browse', browse: true, order: false },
    { level: 'order', browse: true, order: true },
  ];

  for (const { level, browse, order } of TABLE) {
    for (const signedIn of [true, false]) {
      const fallback = signedIn ? '/mon-compte' : '/bienvenue';
      const who = signedIn ? 'connecté' : 'anonyme';

      it(`boutique « ${level} », ${who} : browse → ${browse ? 'ouvert' : fallback}, order → ${order ? 'ouvert' : fallback}`, async () => {
        boot(signedIn).receive({ shop: level, ...ALL_VISIBLE });

        expect(await run('browse')).toBe(browse ? true : fallback);
        expect(await run('order')).toBe(order ? true : fallback);
      });
    }
  }

  /**
   * Décider pendant la lecture renverrait tout le monde ailleurs au premier
   * chargement : le niveau appliqué y vaut `closed`.
   */
  it('attend la lecture avant de trancher', async () => {
    const access = boot(true);
    let decided: true | string | null = null;
    void run('order').then((outcome) => {
      decided = outcome;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(decided).toBeNull();

    access.receive({ shop: 'order', ...ALL_VISIBLE });
    await access.settled();
    await Promise.resolve();
    await Promise.resolve();

    expect(decided).toBe(true);
  });
});
