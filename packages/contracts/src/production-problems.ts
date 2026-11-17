import { z } from "zod";

/**
 * **Le rouge d'une ligne de la fiche** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : « combien est
 * réellement sorti ? », et une raison si on veut.
 *
 * `produced` est un entier ici ; « au moins zéro » et la longueur de la
 * raison sont des règles du domaine, qui les refuse avec un message à lire
 * au fournil.
 */
export const reportWorkshopProblemSchema = z
  .object({
    produced: z.number().int("un nombre entier de pièces"),
    reason: z.string().optional(),
  })
  .strict();
export type ReportWorkshopProblem = z.infer<typeof reportWorkshopProblemSchema>;

/**
 * **Un problème ouvert**, tel que la Supervision le montre : la ligne
 * reste en rouge jusqu'à ce qu'un responsable la marque traitée.
 */
export interface ProductionProblemView {
  /** À renvoyer tel quel pour « Marquer traité ». */
  readonly id: string;
  readonly sku: string;
  readonly productName: string;
  /** Ce que la ligne attendait au moment du rouge : sa quantité au compte. */
  readonly expected: number;
  /** Le sorti déclaré au rouge : le plafond que rien ne dépasse plus ce jour-là. */
  readonly produced: number;
  /**
   * Ce que les fournées disent sorti maintenant, part corrigée déduite.
   * Au-dessus de `produced` : le rouge n'a pas trouvé assez de pièces à
   * corriger (un retour en attente, une part gardée sur place), et l'écart
   * reste à régler à la main.
   */
  readonly output: number;
  /** `null` : aucune raison donnée. */
  readonly reason: string | null;
  /** ISO du dernier rouge : « depuis quand ». */
  readonly reportedAt: string;
  /** `null` : la fiche ne portait pas de nom au moment du geste. */
  readonly reportedByName: string | null;
  /** Monte à chaque rouge sur la même ligne. */
  readonly version: number;
}

/**
 * **Une ligne « à confirmer »** : en toujours vert, mais sans
 * palier à heure ce jour-là (pas de tranche, ou besoins du commerce
 * illisibles). La fournée automatique ne la complète pas ; quelqu'un doit
 * dire ce qui est sorti.
 */
export interface ProductionUnconfirmedLineView {
  readonly sku: string;
  readonly productName: string;
  /** La quantité au compte. */
  readonly quantity: number;
  /** Ce que les fournées disent sorti, part corrigée déduite. */
  readonly output: number;
}

/** `GET /admin/supervision/production-problems?date=` — les problèmes ouverts du jour. */
export interface ProductionProblemsView {
  readonly serviceDay: string;
  readonly problems: readonly ProductionProblemView[];
  /** Les lignes en toujours vert sans palier, pas encore sorties en entier. */
  readonly unconfirmed: readonly ProductionUnconfirmedLineView[];
}
