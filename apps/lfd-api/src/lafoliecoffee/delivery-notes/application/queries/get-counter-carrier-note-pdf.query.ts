import type { Buffer } from "node:buffer";

/**
 * Le BL **de transport** du retrait que le comptoir vient de remettre, en PDF
 * à faire signer au client (Hugo, 2026-11-03 : « la même logique de chiffre
 * qu'en livraison » — on tend le BL non chiffré ; le chiffré reste dans
 * l'espace client et sur la fiche commande). Sans numéro : l'écran n'a pas le
 * droit de lister les BL.
 */
export class GetCounterCarrierNotePdfQuery {
  constructor(readonly orderId: string) {}
}

/** Le BL servi : son numéro, pour tracer l'impression. */
export interface CounterCarrierNotePdf {
  readonly number: string;
  readonly bytes: Buffer;
  readonly fileName: string;
}
