import { FIRST_SHIPMENT_RANK } from "../../../production/channels/packing/index.js";

/** « Il manque » sur le bac d'une commande (lot E6a). */
export class ReportPackingShortfallCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly staffUserId: string,
    /**
     * Le rang de la feuille (plan E7 reliquat, L3b) ; 1 = la commande. Les
     * routes du poste ne le portent pas encore (L8) : elles visent le rang 1.
     */
    readonly rank: number = FIRST_SHIPMENT_RANK,
  ) {}
}
