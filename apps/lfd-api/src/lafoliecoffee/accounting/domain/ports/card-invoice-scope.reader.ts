import type { CardInvoiceScope } from "../services/card-invoicing.js";

/**
 * **Cette commande peut-elle appeler une facture carte ?** — une lecture d'une
 * ligne, sans verrou ni argent (plan E9, lot F, § 3.5). Le réveil au solde
 * part pour TOUTE commande soldée, au compte et particuliers compris : il les
 * écarte ici avant de verrouiller la commande et de lire sa position carte.
 *
 * Port à part de {@link CardInvoicingReader} (ISP) : le réveil n'a besoin que
 * du périmètre, jamais du candidat.
 */
export abstract class CardInvoiceScopeReader {
  /** `null` : la commande n'existe pas. */
  abstract scopeOf(orderId: string): Promise<CardInvoiceScope | null>;
}
