import {
  BusinessError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **tableau croisé** de la bibliothèque d'achat
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, B-D4, lot B2) :
 * la sélection cite des identifiants, et chacun se relit aujourd'hui. Ce qui
 * n'est plus là, ou plus comparable, se NOMME — jamais un 500.
 */

/** Les quatre sortes d'éléments qu'une sélection peut citer. */
export type PurchaseTableItemKind =
  "vehicle_candidate" | "fleet_vehicle" | "bin_candidate" | "bin_type";

const LABELS: Readonly<Record<PurchaseTableItemKind, string>> = {
  vehicle_candidate: "véhicule candidat",
  fleet_vehicle: "véhicule de la flotte",
  bin_candidate: "format candidat",
  bin_type: "type de bac",
};

/** Un élément cité n'existe pas. */
export class PurchaseTableItemNotFoundError extends ResourceNotFoundError {
  constructor(kind: PurchaseTableItemKind, id: string) {
    super(
      `delivery.purchase_table_${kind}_not_found`,
      `Aucun ${LABELS[kind]} sous l'identifiant ${id} : rechargez la sélection du tableau.`,
    );
  }
}

/** Un élément cité a été archivé (candidat, type de bac) ou retiré (véhicule de la flotte). */
export class PurchaseTableItemArchivedError extends BusinessError {
  constructor(kind: PurchaseTableItemKind, name: string) {
    super(
      `delivery.purchase_table_${kind}_archived`,
      kind === "fleet_vehicle"
        ? `Le véhicule « ${name} » a été retiré de la flotte — retirez-le de la sélection.`
        : `Le ${kind.startsWith("bin") ? "format" : "véhicule"} « ${name} » a été archivé — retirez-le de la sélection.`,
    );
  }
}

/** Un véhicule de la flotte sans dimensions utiles : aucun plancher à remplir. */
export class PurchaseTableVehicleWithoutCargoError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.purchase_table_fleet_vehicle_without_cargo",
      `Le véhicule « ${name} » n'a pas d'espace utile renseigné : saisissez ses dimensions dans sa fiche de la flotte, ou retirez-le de la sélection.`,
    );
  }
}

/** Un coût hors des entiers sûrs : les bornes des prix et des planchers l'excluent, c'est un bogue. */
export class PurchaseCostOverflowError extends TechnicalError {
  constructor() {
    super(
      "delivery.purchase_cost_overflow",
      "Le calcul d'un coût du tableau a dépassé les entiers exacts : signalez-le, la sélection n'y est pour rien.",
    );
  }
}
