import type { ServiceRange } from "../../domain/value-objects/service-range.value-object.js";

/** Ce qui est attendu d'un article, un jour donné, tous clients confondus. */
export interface ExpectedItem {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Ce qui est attendu une journée. `AAAA-MM-JJ`, et rien d'autre. */
export interface ExpectedDayProduction {
  readonly day: string;
  readonly items: readonly ExpectedItem[];
  /**
   * Combien de **commandes** composent cette journée — un fait du commerce, que
   * la production ne saurait pas reconstituer : ses articles sont déjà
   * fusionnés par SKU, et les recompter rendrait des références, pas des piles.
   */
  readonly orderCount: number;
}

/**
 * **Ce que le commerce annonce pour les jours qui viennent.**
 *
 * ## Pourquoi ce n'est pas `DayOrdersReader` appelé sept fois
 *
 * `DayOrdersReader` rend des COMMANDES — leur client, leur destination, leur
 * référence — parce que c'est ce qu'une clôture doit figer et ce qu'une feuille
 * d'atelier doit porter. Le prévisionnel n'a besoin d'aucun des trois : il
 * demande des **pièces par produit et par jour**. Lui servir des commandes
 * l'obligerait à réagréger sept fois ce que la base sait sommer, et surtout à
 * connaître des faits — qui commande quoi — dont un mur de planning n'a que
 * faire.
 *
 * C'est l'ISP : deux questions, deux interfaces. Le jour où le prévisionnel
 * changera, `DayOrdersReader` ne bougera pas, et la clôture non plus.
 *
 * ⚠️ **Il vit dans `channels/commerce/`, et l'emplacement EST la frontière** —
 * même motif que `DayOrdersReader`, et même porte : `lint:context-boundaries`
 * n'autorise `b2b → production` que par ce chemin. Le port est DÉCLARÉ ici,
 * IMPLÉMENTÉ par le commerce, et relié dans `appBootstrap`.
 *
 * ⚠️ Ce que « attendu » veut dire appartient au COMMERCE, comme la règle
 * « producible » : la production ne connaît pas l'énuméré de ses statuts. Le
 * jour où un statut s'ajoute, un seul fichier bouge.
 */
export abstract class ExpectedProductionReader {
  /**
   * Une entrée par jour **qui porte quelque chose**. Un jour sans rien à
   * fabriquer peut manquer : la matrice pose des zéros pour toute la plage
   * avant de lire, donc une colonne vide n'a pas besoin d'être annoncée.
   */
  abstract expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayProduction[]>;
}
