import { CustomerIdentityPort, type LoginMethod } from "../customer-identity.port.js";

/**
 * **Les méthodes de connexion, inertes** — pour les doubles qui n'éprouvent pas
 * le rattachement.
 *
 * Le port en porte quatre depuis le 2026-09-22 — trois pour le rattachement,
 * plus l'envoi du lien de mot de passe —, et la plupart des suites du
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

/**
 * L'envoi d'un lien de mot de passe **refuse** au lieu de ne rien faire.
 *
 * Les lectures rendent une liste vide, ce qu'un vrai compte peut rendre. Un
 * envoi, non : « rien n'est parti » n'est jamais un résultat normal, et un
 * doublé qui résout en silence ferait passer au vert une suite qui aurait
 * oublié de brancher son propre double. Celle qui l'exerce en écrit un.
 */
const NO_SEND = (): Promise<void> =>
  Promise.reject(new Error("envoi de lien de mot de passe hors sujet pour ce double"));

/** Pour un double **littéral** : `{ ...NO_LOGIN_METHODS, changeEmail: … }`. */
export const NO_LOGIN_METHODS = {
  listLoginMethods: NONE,
  linkLoginMethod: NONE,
  unlinkLoginMethod: NONE,
  sendPasswordResetLink: NO_SEND,
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

  sendPasswordResetLink(): Promise<void> {
    return NO_SEND();
  }
}
