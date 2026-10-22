import type { CatalogFamilyView } from "@lfd/contracts";

import type {
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../../domain/entities/production-day.js";
import { SPECIMEN_ORDER } from "./specimen-data.js";

/**
 * **La journée d'exemple du fournil** — le compte à produire et le dossier du
 * jour de la planche des documents
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Jamais persistée** : aucune journée ne la porte, aucun papier rendu
 * n'est archivé. Trois commandes, dont celle de la fiche d'atelier, et un
 * réassort — assez pour que le récapitulatif ait plusieurs rayons, le dossier
 * ses annexes, et le camembert plusieurs parts.
 *
 * Les couleurs sont des couleurs d'EXEMPLE : aucune destination ne les porte.
 * Elles sont là pour qu'on contrôle la pastille et le camembert sur le papier.
 * La troisième commande n'en a pas, pour qu'on voie aussi la part neutre.
 */
export const SPECIMEN_DAY_ORDERS: readonly ProductionOrderSnapshot[] = [
  SPECIMEN_ORDER,
  {
    ...SPECIMEN_ORDER,
    orderId: "specimen-order-2",
    reference: "EXEMPLE-0002",
    customerLabel: "EXEMPLE — Chalet des Neiges",
    fulfillmentMethod: "pickup",
    destination: "EXEMPLE — Boutique du Village",
    dueAt: "08:30",
    lines: [
      { sku: "EXEMPLE-BAG", productName: "Baguette tradition", quantity: 12 },
      { sku: "EXEMPLE-PAC", productName: "Pain au chocolat", quantity: 24 },
    ],
  },
  {
    ...SPECIMEN_ORDER,
    orderId: "specimen-order-3",
    reference: "EXEMPLE-0003",
    customerLabel: "EXEMPLE — Restaurant Le Belvédère",
    destination: "EXEMPLE — 4 route du Fornet, 73150 Val d'Isère",
    dueAt: "10:00",
    lines: [
      { sku: "EXEMPLE-CRO", productName: "Croissant pur beurre", quantity: 18 },
      { sku: "EXEMPLE-CAM", productName: "Pain de campagne", quantity: 6 },
    ],
  },
];

/** Le réassort d'exemple : le bon annexe du dossier, la part teintée de son site au camembert. */
export const SPECIMEN_DAY_RESUPPLIES: readonly ProductionResupplySnapshot[] = [
  {
    resupplyId: "specimen-resupply",
    siteId: "specimen-site",
    siteLabel: "EXEMPLE — Village",
    name: "Vitrine du matin",
    servedByTransfer: false,
    lines: [
      { sku: "EXEMPLE-CRO", productName: "Croissant pur beurre", quantity: 20 },
      { sku: "EXEMPLE-BAG", productName: "Baguette tradition", quantity: 15 },
    ],
  },
];

/** Les couleurs d'exemple, par `orderId`. */
export const SPECIMEN_DAY_COLORS: ReadonlyMap<string, string> = new Map([
  [SPECIMEN_ORDER.orderId, "#2e86ab"],
  ["specimen-order-2", "#e4572e"],
]);

/**
 * La teinte de réassort d'exemple, par `siteId` (Hugo, 2026-10-22) : la part
 * du réassort au camembert du compte à produire.
 */
export const SPECIMEN_DAY_RESUPPLY_COLORS: ReadonlyMap<string, string> = new Map([
  ["specimen-site", "#26a69a"],
]);

const BREADS: CatalogFamilyView = { id: "specimen-breads", name: "Pains", position: 1 };
const PASTRIES: CatalogFamilyView = {
  id: "specimen-pastries",
  name: "Viennoiseries",
  position: 2,
};

/** Les rayons d'exemple, par SKU — la tasse n'en a aucun : « Hors catalogue ». */
export const SPECIMEN_DAY_SHELVES: ReadonlyMap<string, CatalogFamilyView> = new Map([
  ["EXEMPLE-BAG", BREADS],
  ["EXEMPLE-CAM", BREADS],
  ["EXEMPLE-CRO", PASTRIES],
  ["EXEMPLE-PAC", PASTRIES],
]);
