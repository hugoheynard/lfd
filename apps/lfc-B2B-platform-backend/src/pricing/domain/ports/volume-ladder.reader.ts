import type { PricingContext } from "../price-rule.js";
import type { VolumeLadder } from "../volume-ladder.js";

/**
 * Port de **lecture** des barèmes de volume.
 *
 * Séparé du port d'écriture pour la même raison que les règles : le chemin qui
 * facture ne doit pas pouvoir écrire un barème, et rien dans son graphe de
 * dépendances ne lui en donne le moyen.
 *
 * Rend des barèmes **candidats**, pas le gagnant : c'est le domaine qui choisit,
 * parce que la spécificité est une règle métier et qu'elle doit rester éprouvable
 * sans base.
 */
export abstract class VolumeLadderReader {
  /** Les barèmes potentiellement applicables à cet article, ce client, cet instant. */
  abstract candidatesFor(context: PricingContext): Promise<VolumeLadder[]>;

  /**
   * Tous les barèmes posés — ce que l'écran de paramétrage montre.
   *
   * Distincte de `candidatesFor` parce qu'elle répond à une autre question :
   * « qu'a-t-on décidé ? » et non « que s'applique-t-il ici ? ».
   *
   * `at` est l'instant **de lecture** : un barème archivé APRÈS lui existait
   * encore ce jour-là, et l'exclure appauvrirait le passé à chaque rangement.
   */
  abstract listAll(at: Date): Promise<VolumeLadder[]>;
}
