import type { OrderStatus } from "@lfd/contracts";

import type { OrderSupply } from "../value-objects/order-supply.js";

/**
 * La marque d'une commande qui prend sa marchandise dans la vitrine (plan du
 * jour J, §11.2, lot L2).
 */
export const SUPPLY_SHELF: OrderSupply = "shelf";

/**
 * **Les statuts d'une commande sur stock qui ne prennent RIEN à la vitrine**
 * (plan du jour J, §11.2 et §12, mineurs) : un brouillon n'a jamais été passé,
 * une annulée a rendu sa part. Tous les autres comptent — une commande au
 * paiement refusé ou en cours garde sa part jusqu'à son annulation, une
 * commande remise l'a emportée.
 */
export const SHELF_DRAW_STATUSES_EXCLUDED: readonly OrderStatus[] = ["draft", "cancelled"];
