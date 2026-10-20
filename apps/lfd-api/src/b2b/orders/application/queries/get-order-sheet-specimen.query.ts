import type { SheetVariant } from "@lfd/contracts";

/**
 * **Le bon de commande d'EXEMPLE**, pro ou public — la planche des documents
 * de la Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Aucune commande en paramètre, et c'est tout le sens : le bon est rendu à
 * partir de données fixes, jamais d'une vraie commande. Une lecture : rien
 * n'est écrit, rien n'est archivé, rien n'est envoyé.
 */
export class GetOrderSheetSpecimenQuery {
  constructor(readonly variant: SheetVariant) {}
}
