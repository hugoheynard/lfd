import type { ContainerBin, ContainerNature } from "../entities/order-contents.js";
import type { ContainerMode, SheetLine, SheetMark } from "../entities/packing-sheet.snapshot.js";

/** Un contenant VIVANT d'une commande, tel que le poste le montre. */
export interface BoardContainer {
  readonly id: string;
  readonly nature: ContainerNature;
  /** Le code du bac, ou « Sac N ». */
  readonly label: string;
  readonly bin: ContainerBin | null;
  /** Les quantités non nulles, par SKU. */
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/** Une commande de la liste à coliser, avec son rangement. */
export interface BoardOrder {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** `pro` / `public` ; `null` = inconnue. */
  readonly clientele: "pro" | "public" | null;
  /** Le site qui remet, identifiant opaque du commerce ; `null` = sans site (L1a). */
  readonly siteId: string | null;
  /** `HH:mm` — l'échéance figée par le fournil ; `null` = aucune. */
  readonly dueAt: string | null;
  /** L'instant du tirage qui l'a inscrite — celui de la clôture pour les premières. */
  readonly drawnAt: Date;
  readonly packed: SheetMark | null;
  /** Sur `listed`, le nombre de contenants vivants ; sur `counted`, le compte. */
  readonly containers: number;
  readonly containerMode: ContainerMode;
  readonly lines: readonly SheetLine[];
  /** Les contenants vivants, dans l'ordre de création. */
  readonly containerList: readonly BoardContainer[];
  /** Le manque signalé en vigueur (E6a), `null` = aucun. */
  readonly shortfallReportedAt: Date | null;
  /** Le départ incomplet décidé (E6b). Absent = aucun. */
  readonly shortfallAuthorizedAt?: Date | null;
}

/** La réserve d'un article : reçu du four, rendu, au bac, réservé. */
export interface BoardStock {
  readonly sku: string;
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
  /** Ce que les réassorts lancés retiennent encore (R4b) — hors d'atteinte des commandes. */
  readonly reserved: number;
}

/** Ce que le colisage tient d'une journée — ses commandes et ses réserves. */
/**
 * Une feuille retirée par une annulation après l'arrêt (plan A1, lot A1.3) —
 * hors du poste, montrée à part sous le badge « annulée après l'arrêt ».
 */
export interface BoardWithdrawnSheet {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly drawnAt: Date;
  readonly withdrawnAt: Date;
}

export interface PackingBoardDay {
  /** Les feuilles du poste — jamais une feuille retirée. */
  readonly orders: readonly BoardOrder[];
  readonly withdrawn: readonly BoardWithdrawnSheet[];
  readonly stocks: readonly BoardStock[];
}

/**
 * **Le poste de colisage d'une journée, en lecture** (plan
 * `colisage/colisage.md`, §17, K3a) — ses tables seulement.
 *
 * Port de LECTURE, séparé de `PackingSheetRepository` (ISP) : le poste lit
 * toute une journée sans verrou ; un geste charge un bac sous verrou.
 */
export abstract class PackingBoardReader {
  abstract dayOf(serviceDay: string): Promise<PackingBoardDay>;
}
