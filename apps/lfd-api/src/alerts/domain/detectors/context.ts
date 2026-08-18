/**
 * Ce qu'un détecteur a le droit de regarder.
 *
 * Tout est **déjà lu et filtré** par l'application : commandes annulées écartées,
 * zéro-friction exclues, fenêtre appliquée, société active vérifiée. Les
 * détecteurs restent purs — aucun port, aucune horloge, aucune base — donc
 * entièrement testables sans Nest, ce qui est le seul moyen d'avoir confiance
 * dans des seuils.
 */
export interface AlertEvaluationContext {
  /** Les lignes de la commande évaluée (un SKU n'y apparaît qu'une fois). */
  readonly lines: readonly EvaluatedLine[];
  /**
   * Historique **récent** du compte par SKU — les N dernières commandes
   * contenant ce SKU dans la fenêtre, la commande courante exclue.
   */
  readonly history: ReadonlyMap<string, readonly number[]>;
  /**
   * Les SKU que ce compte a déjà commandés **un jour**, sans borne de temps.
   *
   * Distinct de `history`, et c'est essentiel : un produit pris il y a trois ans
   * sort de la fenêtre de la dérive, mais il n'est pas « jamais pris ». Confondre
   * les deux ferait crier « nouveau produit » sur un habitué de longue date.
   */
  readonly everOrdered: ReadonlySet<string>;
  /** Nombre de commandes antérieures du compte, tous produits confondus. */
  readonly previousOrderCount: number;
  /** La norme du catalogue par SKU — médiane cross-comptes, matérialisée. */
  readonly norms: ReadonlyMap<string, ProductNorm>;
}

/** Une ligne de la commande évaluée. */
export interface EvaluatedLine {
  readonly sku: string;
  /**
   * Le nom figé porté par la ligne de commande — ou le **SKU**, lors d'un
   * contrôle de panier : la commande n'existe pas encore, donc aucun nom n'a été
   * figé. Sans conséquence sur ce que voit le client : le message client ne
   * nomme pas le produit (le callout se pose sous la ligne, qui le nomme déjà).
   */
  readonly productName: string;
  readonly quantity: number;
}

/**
 * Ce qu'on commande **habituellement** de ce produit, tous comptes confondus.
 *
 * `medianQuantity` et non une moyenne : une moyenne se fait déplacer par
 * l'aberration qu'on cherche, donc une faute de frappe passée une fois
 * éteindrait la détection des suivantes.
 */
export interface ProductNorm {
  readonly medianQuantity: number;
  /** Nombre de lignes observées — sous un plancher, il n'y a pas de « norme ». */
  readonly sampleLines: number;
}
