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
  /** L'instant du tirage qui l'a inscrite — celui de la clôture pour les premières. */
  readonly drawnAt: Date;
  readonly packed: SheetMark | null;
  /** Sur `listed`, le nombre de contenants vivants ; sur `counted`, le compte. */
  readonly containers: number;
  readonly containerMode: ContainerMode;
  readonly lines: readonly SheetLine[];
  /** Les contenants vivants, dans l'ordre de création. */
  readonly containerList: readonly BoardContainer[];
}

/** La réserve d'un article : reçu du four, rendu, au bac. */
export interface BoardStock {
  readonly sku: string;
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
}

/** Ce que le colisage tient d'une journée — ses commandes et ses réserves. */
export interface PackingBoardDay {
  readonly orders: readonly BoardOrder[];
  readonly stocks: readonly BoardStock[];
}

/**
 * **Le poste de colisage d'une journée, en lecture** (plan
 * `colisage/plan-domaine-colisage.md`, §17, K3a) — ses tables seulement.
 *
 * Port de LECTURE, séparé de `PackingSheetRepository` (ISP) : le poste lit
 * toute une journée sans verrou ; un geste charge un bac sous verrou.
 */
export abstract class PackingBoardReader {
  abstract dayOf(serviceDay: string): Promise<PackingBoardDay>;
}
