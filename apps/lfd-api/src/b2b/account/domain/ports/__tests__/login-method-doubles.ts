import { CustomerIdentityPort, type LoginMethod } from "../customer-identity.port.js";

/**
 * **Les méthodes de connexion, inertes** — pour les doubles qui n'éprouvent pas
 * le rattachement.
 *
 * Le port en porte trois depuis le 2026-09-22, et la plupart des suites du
 * contexte ne s'en servent pas : leur faire réécrire trois corps vides les
 * ferait diverger au premier changement de signature, et c'est exactement
 * comme ça qu'un doublé cesse de jouer le port qu'il prétend jouer. Elles
 * rendent une liste vide, ce qu'un compte sans méthode secondaire rend aussi —
 * jamais un refus muet.
 *
 * Deux formes parce que les doubles existants en ont deux : une classe pour
 * ceux qui étendent le port, un objet à répandre pour ceux qui sont des
 * littéraux typés.
 */
const NONE = (): Promise<readonly LoginMethod[]> => Promise.resolve([]);

/** Pour un double **littéral** : `{ ...NO_LOGIN_METHODS, changeEmail: … }`. */
export const NO_LOGIN_METHODS = {
  listLoginMethods: NONE,
  linkLoginMethod: NONE,
  unlinkLoginMethod: NONE,
};

/** Pour un double **de classe** : `class X extends IdentityWithoutLoginMethods`. */
export abstract class IdentityWithoutLoginMethods extends CustomerIdentityPort {
  listLoginMethods(): Promise<readonly LoginMethod[]> {
    return NONE();
  }

  linkLoginMethod(): Promise<readonly LoginMethod[]> {
    return NONE();
  }

  unlinkLoginMethod(): Promise<readonly LoginMethod[]> {
    return NONE();
  }
}
