import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { PERSONAL_WORKSPACE, type ShopLevel } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { companyWorkspaceGuard, workspaceHomeGuard } from './client-workspace.guard';
import { provideWorkspace, workspaceDouble } from './client-workspace.fixture';
import { ClientFeatureAccess } from './feature-access/client-feature-access.service';
import { DEFAULT_SURFACES } from './feature-access/feature-access.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

/** La garde ne lit ni la route ni l'état : seulement l'espace et la boutique. */
const ROUTE = {} as ActivatedRouteSnapshot;
const STATE = {} as RouterStateSnapshot;

interface Case {
  readonly signedIn?: boolean;
  readonly current: string | null;
  readonly companies: boolean;
  readonly shop?: ShopLevel;
}

/** Où la garde envoie : `true`, ou l'adresse de renvoi. */
async function run({ signedIn = true, current, companies, shop = 'order' }: Case) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthFacade, useValue: { authGate$: () => of(signedIn) } },
      provideWorkspace(workspaceDouble(current, companies ? [TOMMEUSES] : [])),
      {
        provide: ClientFeatureAccess,
        useFactory: () => {
          const access = new ClientFeatureAccess();
          access.load = () => Promise.resolve();
          return access;
        },
      },
    ],
  });
  TestBed.inject(ClientFeatureAccess).receive({ shop, ...DEFAULT_SURFACES });
  const result = await TestBed.runInInjectionContext(() => companyWorkspaceGuard(ROUTE, STATE));
  return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
}

describe('companyWorkspaceGuard', () => {
  it('ferme les écrans de société en perso, pour qui en a une', async () => {
    expect(await run({ current: PERSONAL_WORKSPACE, companies: true })).toBe('/mon-espace');
  });

  it('les ouvre dans l’espace de la société', async () => {
    expect(await run({ current: TOMMEUSES.id, companies: true })).toBe(true);
  });

  /** Sans société, Mon compte est la porte pro : le retour d'inscription y atterrit. */
  it('les laisse ouverts à qui n’a aucune société', async () => {
    expect(await run({ current: PERSONAL_WORKSPACE, companies: false })).toBe(true);
  });

  it('laisse passer qui n’est pas connecté — l’écran sait l’accueillir', async () => {
    expect(await run({ signedIn: false, current: null, companies: false })).toBe(true);
  });

  /**
   * Boutique fermée : `/mon-espace` renverrait vers `/mon-compte`, et les deux
   * gardes se renverraient la personne sans fin.
   */
  it('ne renvoie pas vers un accueil fermé', async () => {
    expect(await run({ current: PERSONAL_WORKSPACE, companies: true, shop: 'closed' })).toBe(true);
  });
});

/** Où l'entrée envoie : toujours une adresse. */
async function land({ signedIn = true, current, companies }: Omit<Case, 'shop'>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthFacade, useValue: { authGate$: () => of(signedIn) } },
      provideWorkspace(workspaceDouble(current, companies ? [TOMMEUSES] : [])),
    ],
  });
  const result = await TestBed.runInInjectionContext(() => workspaceHomeGuard(ROUTE, STATE));
  return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
}

describe('workspaceHomeGuard — la cible de la connexion', () => {
  /**
   * Régression : la connexion envoyait tout le monde sur `/nouvelle-commande`,
   * y compris en perso, dont l'accueil est `/bienvenue` (Hugo, 2026-09-17).
   */
  it('🔴 envoie une connexion en perso sur l’accueil public', async () => {
    expect(await land({ current: PERSONAL_WORKSPACE, companies: true })).toBe('/bienvenue');
  });

  it('envoie aussi sur l’accueil public qui n’a aucune société', async () => {
    expect(await land({ current: PERSONAL_WORKSPACE, companies: false })).toBe('/bienvenue');
  });

  it('envoie une connexion dans une société sur la prise de commande', async () => {
    expect(await land({ current: TOMMEUSES.id, companies: true })).toBe('/nouvelle-commande');
  });

  it('envoie qui n’est pas connecté sur l’accueil public', async () => {
    expect(await land({ signedIn: false, current: null, companies: false })).toBe('/bienvenue');
  });
});
