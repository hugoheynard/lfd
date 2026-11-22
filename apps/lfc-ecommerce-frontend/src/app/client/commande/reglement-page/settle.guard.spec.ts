import { TestBed } from '@angular/core/testing';
import {
  convertToParamMap,
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { HeldOrderPayment } from '../../held-order-payment.service';
import { settleGuard } from './settle.guard';

interface Situation {
  readonly held: string | null;
  readonly authenticated: boolean;
}

async function run({ held, authenticated }: Situation): Promise<unknown> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HeldOrderPayment, useValue: { holdsPaymentFor: (id: string) => id === held } },
      { provide: AuthFacade, useValue: { authGate$: () => of(authenticated) } },
    ],
  });
  const route = { paramMap: convertToParamMap({ id: 'ord_1' }) } as ActivatedRouteSnapshot;
  const state: Pick<RouterStateSnapshot, 'url'> = { url: '/reglement/ord_1' };
  const result = TestBed.runInInjectionContext(() =>
    settleGuard(route, state as RouterStateSnapshot),
  );
  return isObservable(result) ? firstValueFrom(result) : result;
}

describe('settleGuard — qui entre sur la page de règlement', () => {
  it('laisse passer le visiteur qui vient de passer la commande, même sans compte', async () => {
    expect(await run({ held: 'ord_1', authenticated: false })).toBe(true);
  });

  it('laisse passer un client connecté arrivé par un lien de règlement', async () => {
    expect(await run({ held: null, authenticated: true })).toBe(true);
  });

  /**
   * Régression : un lien de règlement envoyé par e-mail menait un client non
   * connecté à « règlement clos », la page ne pouvant rien demander pour lui.
   */
  it('envoie un client non connecté à la connexion, puis le ramène ici', async () => {
    const tree = await run({ held: null, authenticated: false });

    expect(tree).toBeInstanceOf(UrlTree);
    expect(String(tree)).toBe('/login?returnTo=%2Freglement%2Ford_1');
  });

  it("ne confond pas le paiement d'une autre commande avec celui-ci", async () => {
    const tree = await run({ held: 'ord_2', authenticated: false });

    expect(tree).toBeInstanceOf(UrlTree);
  });
});
