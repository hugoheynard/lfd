import type { CardInvoiceCandidate } from "../services/card-invoicing.js";

/**
 * Ce que lit **la facture carte** d'une commande (lot E5a), et elle seule.
 * À appeler sous le verrou de la commande (`OrderInvoicingLock`) : la
 * lecture « déjà facturée ? » ne vaut que tant qu'un autre déclencheur ne
 * peut pas émettre entre-temps.
 */
export abstract class CardInvoicingReader {
  /** La commande et ce qu'il faut pour la juger ; `null` si elle n'existe pas. */
  abstract candidate(orderId: string): Promise<CardInvoiceCandidate | null>;
}
