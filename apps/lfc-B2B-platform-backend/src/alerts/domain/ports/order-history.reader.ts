import type { AlertEvaluationContext } from "../detectors/context.js";

/** Ce dont l'évaluation a besoin, en **une** lecture par commande. */
export interface AccountOrderHistory {
  /** Les quantités passées par SKU, la commande courante exclue, dans la fenêtre. */
  readonly history: ReadonlyMap<string, readonly number[]>;
  /** Tous les SKU déjà commandés un jour par ce compte, sans borne de temps. */
  readonly everOrdered: ReadonlySet<string>;
  /** Nombre de commandes antérieures du compte, tous produits confondus. */
  readonly previousOrderCount: number;
}

/**
 * L'historique d'un compte, tel que les détecteurs le voient.
 *
 * **Une** méthode, et une seule lecture : une commande de quarante lignes ne doit
 * pas produire quarante allers-retours. Le port impose donc la forme groupée
 * plutôt que de laisser l'appelant boucler.
 *
 * Les filtres tranchés vivent dans l'adaptateur, pas chez l'appelant : commandes
 * annulées écartées, zéro-friction exclues, fenêtre appliquée. Un consommateur ne
 * doit pas pouvoir « oublier » un de ces filtres.
 */
export abstract class AccountOrderHistoryReader {
  abstract read(input: {
    readonly companyId: string;
    /** La commande évaluée — exclue de son propre historique. */
    readonly excludeOrderId: string;
    readonly skus: readonly string[];
    /** Fenêtre de récence, en jours (celle de la règle de dérive). */
    readonly windowDays: number;
    /**
     * Le **maintenant** de la requête, fourni par l'appelant.
     *
     * L'adaptateur ne lit pas l'horloge : le temps métier a une autorité unique
     * (`Clock`), et une fenêtre calculée deux fois dans la même évaluation
     * dériverait de quelques millisecondes.
     */
    readonly now: Date;
    /** Nombre maximum de commandes retenues par SKU. */
    readonly maxOrdersPerSku: number;
  }): Promise<AccountOrderHistory>;
}

/** La norme catalogue par SKU, lue depuis la projection matérialisée. */
export abstract class ProductNormReader {
  abstract read(skus: readonly string[]): Promise<AlertEvaluationContext["norms"]>;
}
