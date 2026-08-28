import { Injectable, signal } from '@angular/core';

/**
 * Ce que l'écran courant fait dire à l'en-tête de l'app cliente.
 *
 * L'en-tête appartient au shell — il est le même sur tous les écrans, c'est ce
 * qui en fait le chrome. Mais deux choses y changent avec l'écran : le sur-titre
 * (« Bienvenue », « Connexion », « Rappel ») et l'existence d'un retour. Plutôt
 * que de faire redescendre l'état par des entrées à travers le `router-outlet`,
 * l'écran le PUBLIE ici et le shell le lit.
 *
 * Le retour est une fonction et pas un booléen : l'écran est le seul à savoir
 * d'où on vient — un panneau se ferme, une étape recule. Le shell, lui, n'a qu'à
 * dessiner la flèche quand il y a quelque chose à appeler.
 */
@Injectable({ providedIn: 'root' })
export class ClientChrome {
  /** Le sur-titre sous la marque. */
  readonly kicker = signal('');

  /** Ce que fait la flèche de retour — `null` quand il n'y a pas de retour. */
  readonly back = signal<(() => void) | null>(null);

  /**
   * L'écran donne-t-il accès au menu ?
   *
   * Un booléen, et plus une fonction : tant que le menu n'existait pas, l'écran
   * était le seul à savoir quoi ouvrir. Maintenant qu'il y en a un, et un seul,
   * c'est le SHELL qui l'ouvre — l'écran n'a plus à dire quoi faire, seulement
   * s'il y a lieu de le faire.
   *
   * Ce fait décide aussi de ce que porte la barre : la réf donne la pastille de
   * MARQUE au visiteur, qui a besoin de savoir où il est, et le MENU à qui est
   * reconnu, qui a besoin d'accéder à ses affaires. Il commande enfin la
   * sous-barre de bureau, qui porte les mêmes destinations en permanence.
   */
  readonly menu = signal(false);

  /** Ce que fait la cloche — `null` quand l'écran n'en porte pas. */
  readonly bell = signal<(() => void) | null>(null);

  /** Le nombre de non-lues. Zéro : la cloche reste, sa pastille disparaît. */
  readonly bellCount = signal(0);

  /**
   * L'écran garde-t-il la barre au-delà du pli ?
   *
   * L'accueil dit non : en desktop, la réf lui donne deux colonnes et la marque
   * remonte dans la colonne bleue. Une barre au-dessus ferait doublon. Les
   * écrans qui n'en disent rien la gardent.
   */
  readonly barOnDesktop = signal(true);
}
