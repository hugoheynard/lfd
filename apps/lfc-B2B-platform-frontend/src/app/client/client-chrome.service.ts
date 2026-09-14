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

  /**
   * Le bandeau pose-t-il sa LÈVRE — le bord crème arrondi qui remonte sur l'encre ?
   *
   * Oui par défaut : sous le bandeau, un écran est une feuille crème, et la lèvre
   * en est le bord. Non sous le châssis d'entrée (`ClientPage`), où ce qui suit
   * le bandeau est l'ACCROCHE, sur l'encre, et où la feuille porte sa propre
   * lèvre plus bas. Les deux ensemble dessinaient une languette crème au-dessus
   * du titre, en pile (relevé sur `/bienvenue` et `/ouverture-compte-pro` le
   * 2026-09-14 ; né avec la descente ouverte aux visiteurs, `6655acdf`).
   *
   * C'est le châssis qui l'éteint et le rallume en partant : un écran qui ne dit
   * rien garde la lèvre, comme il garde la barre.
   */
  readonly bandLip = signal(true);

  /**
   * En PILE, le bandeau reste-t-il dans la bande fixe ?
   *
   * Oui par défaut. Mais la bande est une rangée fixe du shell : un bandeau haut
   * y mange l'écran du téléphone — 338 px sur 812 sur Mon compte, mesuré le
   * 2026-09-14, laissant 410 px au contenu. Un écran qui dit non reprend son
   * bandeau dans le flux de sa page, où il défile avec elle ; la bande n'en
   * garde rien en pile, et rien ne change au-delà du pli.
   *
   * C'est l'écran qui l'éteint et le rallume en partant, comme la lèvre.
   */
  readonly bandNarrow = signal(true);
}
