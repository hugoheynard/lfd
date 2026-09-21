import { TestBed } from '@angular/core/testing';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { StaffAuth } from '../staff-auth';

/**
 * La **course** que ce fichier existe pour interdire.
 *
 * Au retour du callback Auth0, le garde de route demande les permissions avant
 * que le SDK ait restauré la session. Si la source du jeton répond `null` à ce
 * moment-là, l'appel part sans en-tête, prend un `401`, et le magasin de
 * permissions retient ce refus **sans jamais réessayer** : « aucun accès » pour
 * toute la session. Sur un appareil neuf, c'est à chaque première connexion.
 *
 * Le contrat éprouvé ici est donc : **tant que le SDK charge, on attend** — on
 * ne répond pas « pas de jeton » à une question dont on n'a pas la réponse.
 */
function setup(loading: BehaviorSubject<boolean>, token = 'jeton-staff') {
  const getAccessTokenSilently = vi.fn(() => of(token));
  const auth: Pick<AuthService, 'isLoading$' | 'getAccessTokenSilently'> & {
    isAuthenticated$: unknown;
    user$: unknown;
    appState$: unknown;
  } = {
    isLoading$: loading.asObservable(),
    getAccessTokenSilently: getAccessTokenSilently as never,
    isAuthenticated$: of(true),
    user$: of({ email: 'dev@lafoliedouce.com' }),
    appState$: of(),
  };
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
  return { staff: TestBed.inject(StaffAuth), getAccessTokenSilently };
}

describe('StaffAuth.token — la course du premier chargement', () => {
  it("n'interroge pas Auth0 tant que la session n'est pas résolue", async () => {
    const loading = new BehaviorSubject(true);
    const { staff, getAccessTokenSilently } = setup(loading);

    const pending = staff.token();
    // Le SDK charge encore : rien ne doit avoir été demandé.
    await Promise.resolve();
    expect(getAccessTokenSilently).not.toHaveBeenCalled();

    loading.next(false);

    expect(await pending).toBe('jeton-staff');
    expect(getAccessTokenSilently).toHaveBeenCalledTimes(1);
  });

  it('rend le jeton immédiatement quand la session est déjà résolue', async () => {
    const { staff } = setup(new BehaviorSubject(false));

    expect(await staff.token()).toBe('jeton-staff');
  });
});

describe('StaffAuth.token — après résolution, un échec reste un `null`', () => {
  it('ne fait pas échouer l’appelant : le mur reste le backend', async () => {
    const loading = new BehaviorSubject(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { staff } = setup(loading);
    TestBed.inject(AuthService).getAccessTokenSilently = ((): never =>
      throwError(() => new Error('audience inconnue')) as never) as never;

    expect(await staff.token()).toBeNull();
    // …mais on le DIT : sans ce cri, la cause est à trois couches du 401 final.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
