import { z } from "zod";

import { purchaseTablePayloadSchema } from "./delivery-purchase-table.js";

/**
 * **Les scénarios d'achat enregistrés**
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D5, lot B3) :
 * la SÉLECTION du tableau croisé, gardée sous un nom pour être relancée.
 *
 * Un scénario CITE des identifiants (`{source, id}`), il ne copie pas les
 * cotes : on le relance sur les valeurs d'aujourd'hui. À la relecture, un
 * élément archivé, retiré ou disparu ne l'empêche pas de s'ouvrir — il est
 * NOMMÉ dans `issues`, pour qu'on le retire avant de relancer le tableau.
 */

/** La borne du nom, comme celle des scénarios du simulateur. */
export const PURCHASE_SCENARIO_NAME_MAX = 80;

/** Ce que l'écran classe : taux d'occupation, volume utile, coût par litre. */
export const purchaseScenarioCriterionSchema = z.enum(["occupation", "volume", "costPerLiter"]);
export type PurchaseScenarioCriterion = z.infer<typeof purchaseScenarioCriterionSchema>;

/** L'affichage gardé avec la sélection : le critère et le coût par litre visible (Q3). */
export const purchaseScenarioDisplaySchema = z.object({
  criterion: purchaseScenarioCriterionSchema,
  showCostPerLiter: z.boolean(),
});
export type PurchaseScenarioDisplay = z.infer<typeof purchaseScenarioDisplaySchema>;

/**
 * Le contenu d'un scénario : la sélection, revalidée par le MÊME schéma que le
 * tableau, à l'écriture et à chaque relecture ; l'affichage, s'il a été gardé.
 */
export const purchaseScenarioContentSchema = z.object({
  selection: purchaseTablePayloadSchema,
  display: purchaseScenarioDisplaySchema.nullable(),
});
export type PurchaseScenarioContent = z.infer<typeof purchaseScenarioContentSchema>;

/** Enregistrer (créer ou remplacer) un scénario. */
export const savePurchaseScenarioPayloadSchema = purchaseScenarioContentSchema.extend({
  name: z
    .string()
    .trim()
    .min(1, "nom du scénario requis")
    .max(PURCHASE_SCENARIO_NAME_MAX, `${PURCHASE_SCENARIO_NAME_MAX} caractères au plus`),
});
export type SavePurchaseScenarioPayload = z.infer<typeof savePurchaseScenarioPayloadSchema>;

/** `?archives=inclure` rend aussi les archivés ; sans, la liste n'a que les scénarios en cours. */
export const purchaseScenarioListQuerySchema = z.object({
  archives: z.literal("inclure").optional(),
});
export type PurchaseScenarioListQuery = z.infer<typeof purchaseScenarioListQuerySchema>;

/** Une ligne de la liste, triée par nom. */
export interface PurchaseScenarioSummaryView {
  readonly id: string;
  readonly name: string;
  /** Nombre de véhicules et de formats cités ; zéro si le contenu ne se relit plus. */
  readonly vehicles: number;
  readonly formats: number;
  readonly updatedAt: string;
  /** Le nom lisible du staff du dernier geste ; `null` s'il n'était pas connu. */
  readonly updatedBy: string | null;
  /** Archivé le, ou `null` s'il est en cours. */
  readonly archivedAt: string | null;
}

export interface PurchaseScenariosView {
  readonly scenarios: readonly PurchaseScenarioSummaryView[];
}

/** Les quatre sortes d'éléments qu'une sélection cite. */
export type PurchaseScenarioItemKind =
  "vehicle_candidate" | "fleet_vehicle" | "bin_candidate" | "bin_type";

/**
 * Pourquoi un élément cité ne peut plus entrer au tableau : archivé (candidat,
 * type de bac), retiré (véhicule de la flotte), introuvable, ou sans espace
 * utile (véhicule de la flotte).
 */
export type PurchaseScenarioIssueProblem = "archived" | "retired" | "not_found" | "without_cargo";

/** Un élément cité qui ne passerait plus au tableau, nommé. */
export interface PurchaseScenarioIssueView {
  readonly kind: PurchaseScenarioItemKind;
  /** La source telle que la sélection la cite : à retirer par `{source, id}`. */
  readonly source: "candidate" | "fleet" | "bin_type";
  readonly id: string;
  /** Son nom d'aujourd'hui ; `null` s'il est introuvable. */
  readonly name: string | null;
  readonly problem: PurchaseScenarioIssueProblem;
  /** La phrase du refus que le tableau opposerait — même texte. */
  readonly message: string;
}

/** Un scénario rouvert : de quoi remplir l'écran, et ce qu'il faut corriger. */
export interface PurchaseScenarioView {
  readonly id: string;
  readonly name: string;
  readonly selection: PurchaseScenarioContent["selection"];
  readonly display: PurchaseScenarioDisplay | null;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  /** Vide si tout se relance tel quel. */
  readonly issues: readonly PurchaseScenarioIssueView[];
}
