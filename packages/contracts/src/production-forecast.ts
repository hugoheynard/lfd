import { z } from "zod";

/**
 * **Le prévisionnel du fournil** — la matrice `produits × jours`.
 *
 * Ce n'est pas la question de la fiche d'atelier. Celui qui ouvre cet écran ne
 * cherche pas ce qu'il doit faire maintenant — c'est déjà au four — mais **le
 * mur qui arrive** : le samedi à 3 800 pièces, le week-end à couvrir, la
 * commande exceptionnelle qui double une ligne.
 *
 * Trois conséquences portées par le CONTRAT, et pas seulement par l'écran :
 *
 * - **`quantities` a toujours la longueur de `days`.** Un trou est un `0`, pas
 *   un `undefined` : sans ça, l'alignement des colonnes dépendrait du rendu, et
 *   deux navigateurs pourraient décaler une quantité d'une journée ;
 * - **`peakDate` vient du SERVEUR.** Le calculer côté écran donnerait un pic
 *   différent selon la plage affichée — donc un pic qui bouge quand on navigue,
 *   alors que c'est précisément l'information qu'on vient chercher ;
 * - **aucun montant.** Même règle que la fiche d'atelier et le bon de livraison :
 *   le fournil fabrique, il ne facture pas. L'absence est portée par le type, il
 *   n'y a pas de champ à laisser vide.
 *
 * ⚠️ **Et aucun rayon.** La matrice sort à plat, un produit par ligne. Le rayon
 * est une propriété du **catalogue d'aujourd'hui**, pas de la commande ni de la
 * journée de fabrication — c'est déjà ce que la récapitulation du jour fait, en
 * joignant le catalogue côté écran (`production-recap.ts`). Le porter ici
 * obligerait la production à connaître le référentiel, ce que la matrice des
 * frontières lui interdit, et ferait de surcroît mentir l'historique : un
 * produit qui change de rayon réécrirait les journées déjà arrêtées.
 */

/**
 * La plage demandée. Deux bornes, et pas « une semaine » : le fournil ne
 * raisonne pas en semaine calendaire, il raisonne en **jours à couvrir**.
 *
 * La **forme** seule est validée ici. Que `to` suive `from`, et que la plage
 * reste lisible d'un coup d'œil, est une règle du domaine — `ServiceRange` la
 * porte côté serveur, et un refus y nomme le cas réel.
 */
export const productionForecastQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type ProductionForecastQuery = z.infer<typeof productionForecastQuerySchema>;

/** Une colonne : un jour de service, son total, et s'il est arrêté. */
export interface ProductionForecastDay {
  /** `AAAA-MM-JJ`. */
  readonly date: string;
  /** Toutes références confondues — le chiffre de l'en-tête de colonne. */
  readonly totalUnits: number;
  /**
   * `true` = la journée est **close**, et sa colonne est le compte à produire
   * arrêté à la clôture — un fait, pas une prévision.
   *
   * 🔴 La distinction n'est pas cosmétique : sur une journée close, le commerce
   * a basculé ses commandes hors de `placed`, donc la demande « attendue » y est
   * **vide**. Une colonne qui ne dirait pas d'où vient son chiffre afficherait
   * zéro pour aujourd'hui tous les matins — c'est-à-dire le contraire de ce que
   * l'écran existe pour montrer.
   */
  readonly closed: boolean;
}

/** Une ligne : un produit, et ce qu'il pèse chaque jour de la plage. */
export interface ProductionForecastLine {
  readonly sku: string;
  /** Le nom **figé à la commande** — le seul dont on soit sûr qu'il a été vendu. */
  readonly productName: string;
  /** Même longueur que `days`, dans le même ordre. Un trou vaut `0`. */
  readonly quantities: readonly number[];
  /** Le poids du produit sur toute la plage — l'ordre de lecture d'un rayon. */
  readonly totalUnits: number;
}

/**
 * La matrice entière. `lines` est ordonné par **SKU** : un ordre stable, donc
 * deux lectures de la même plage rendent la même grille. L'ordre d'AFFICHAGE
 * (rayon, puis quantité décroissante) appartient à l'écran, qui seul connaît le
 * catalogue.
 */
export interface ProductionForecastView {
  readonly days: readonly ProductionForecastDay[];
  readonly lines: readonly ProductionForecastLine[];
  /**
   * Le jour le plus chargé de la plage, ou `null` si elle est vide.
   *
   * À égalité, **le plus proche** : c'est celui qui tombe le premier, donc celui
   * qu'on prépare d'abord.
   */
  readonly peakDate: string | null;
  /** La plage entière, en pièces — la phrase qu'on lit en haut de l'écran. */
  readonly totalUnits: number;
}
