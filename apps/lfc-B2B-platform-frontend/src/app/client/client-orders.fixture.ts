import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientOrders, type PlacedOrder } from './client-orders.service';

/**
 * **Un client reconnu**, pour les suites qui passent commande.
 *
 * Auth0 est la seule frontière qu'on double : elle exige un tenant distant, et
 * ce n'est pas elle que ces suites éprouvent. Le reste — la charge envoyée, le
 * numéro relu, le panier vidé — est réel.
 */
export const RECOGNISED = {
  isAuthenticated: () => true,
  accessToken$: () => of('jeton-de-test'),
};

/** Le fournisseur à poser dans le `TestBed` des suites qui commandent. */
export const provideRecognised = () => ({ provide: AuthFacade, useValue: RECOGNISED });

/**
 * Passe la commande **et répond à sa place** — l'appel HTTP est réel, sa
 * réponse est doublée.
 *
 * Depuis que `place()` écrit au serveur, une suite qui l'appelle sans répondre
 * reste suspendue sur une promesse. Ce helper existe pour que le geste redevienne
 * une ligne, et pour que le NUMÉRO vienne d'ailleurs que du navigateur — c'est
 * tout l'objet du lot.
 */
export async function placeOrder(orderNumber = 'CMD-0001'): Promise<PlacedOrder | null> {
  const placing = TestBed.inject(ClientOrders).place();
  // Laisse partir le jeton puis la requête : les deux sont des micro-tâches.
  await Promise.resolve();
  await Promise.resolve();
  TestBed.inject(HttpTestingController)
    .expectOne((request) => request.url.endsWith('/orders'))
    .flush({ id: 'ord_1', orderNumber });
  return placing;
}
