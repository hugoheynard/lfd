import type { GroupingSource } from "../../../shared/print/index.js";
import type { SimulatedArticle } from "../../domain/services/production-simulation.js";
import { SPECIMEN_DAY_SHELVES } from "./specimen-day.js";

/**
 * **La simulation du catalogue d'EXEMPLE** — la planche des documents
 * (`documentation/comptabilite/planche-des-documents.md`), en mode prod :
 * deux postes, un article sans poste (le pain au chocolat, « à ranger ») et
 * un article hors catalogue (la tasse), pour que la couverture montre les
 * deux cas.
 *
 * 🔴 **Jamais persistée** : aucune carte des postes ne porte ces postes.
 */
export const SPECIMEN_SIMULATION_ARTICLES: readonly SimulatedArticle[] = [
  { sku: "EXEMPLE-BAG", name: "Baguette tradition" },
  { sku: "EXEMPLE-CAM", name: "Pain de campagne" },
  { sku: "EXEMPLE-CRO", name: "Croissant pur beurre" },
  { sku: "EXEMPLE-PAC", name: "Pain au chocolat" },
  { sku: "EXEMPLE-TAS", name: "Tasse La Folie Coffee" },
];

/** Ce que le mode prod a lu pour ranger. */
type GroupingPlacement = Extract<GroupingSource, { readonly mode: "workstation" }>["placement"];

const BAKERY = { id: "specimen-ws-bakery", name: "EXEMPLE — Boulangerie" };
const LAMINATION = { id: "specimen-ws-lamination", name: "EXEMPLE — Tourier" };

/** Les articles d'exemple ont pour produit leur propre référence ; la tasse n'en a pas. */
const SPECIMEN_ARTICLES: GroupingPlacement["articles"] = new Map(
  [...SPECIMEN_DAY_SHELVES].map(([sku, family]) => [sku, { productSku: sku, family }]),
);

/** Le rangement d'exemple : le pain au chocolat n'a pas de poste. */
export const SPECIMEN_SIMULATION_PLACEMENT: GroupingPlacement = {
  workstations: [BAKERY, LAMINATION],
  articles: SPECIMEN_ARTICLES,
  byProduct: new Map([
    ["EXEMPLE-BAG", BAKERY.id],
    ["EXEMPLE-CAM", BAKERY.id],
    ["EXEMPLE-CRO", LAMINATION.id],
  ]),
};
