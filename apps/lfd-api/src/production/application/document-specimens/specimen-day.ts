import type { CatalogFamilyView } from "@lfd/contracts";

import type {
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../../domain/entities/production-day.js";
import { SPECIMEN_ORDER } from "./specimen-data.js";
import type { TrancheThreshold } from "../../domain/services/production-tranches.js";

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
      { sku: "EXEMPLE-BAG", productName: "Baguette tradition", quantity: 12, saleUnit: "piece" },
      { sku: "EXEMPLE-PAC", productName: "Pain au chocolat", quantity: 24, saleUnit: "piece" },
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
      { sku: "EXEMPLE-CRO", productName: "Croissant pur beurre", quantity: 18, saleUnit: "piece" },
      { sku: "EXEMPLE-CAM", productName: "Pain de campagne", quantity: 6, saleUnit: "piece" },
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
      { sku: "EXEMPLE-CRO", productName: "Croissant pur beurre", quantity: 20, saleUnit: "piece" },
      { sku: "EXEMPLE-BAG", productName: "Baguette tradition", quantity: 15, saleUnit: "piece" },
      // Un réassort au poids (lot L2b-2) : le bon dit « 2 kg », le total ne
      // le compte que pour une ligne.
      { sku: "EXEMPLE-SAU", productName: "Saumon gravlax", quantity: 2000, saleUnit: "weight" },
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

/**
 * Les tranches d'exemple de la fiche d'atelier (le calendrier du dossier,
 * 2026-11-02) : deux heures, et le pain de campagne sans échéance — il tombe
 * dans « Sans heure », comme un vrai produit sans marge réglée. Totaux : ceux
 * des commandes et réassorts d'exemple ci-dessus.
 */
export const SPECIMEN_DAY_TRANCHES: ReadonlyMap<string, readonly TrancheThreshold[]> = new Map([
  [
    "EXEMPLE-CRO",
    [
      { kind: "deadline", before: "05:00", quantity: 20, cumulative: 20 },
      { kind: "deadline", before: "07:00", quantity: 18, cumulative: 38 },
    ],
  ],
  ["EXEMPLE-PAC", [{ kind: "deadline", before: "07:00", quantity: 24, cumulative: 24 }]],
  [
    "EXEMPLE-BAG",
    [
      { kind: "deadline", before: "05:00", quantity: 15, cumulative: 15 },
      { kind: "deadline", before: "07:00", quantity: 12, cumulative: 27 },
    ],
  ],
]);
