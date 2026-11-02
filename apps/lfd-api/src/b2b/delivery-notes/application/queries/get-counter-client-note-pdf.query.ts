import type { Buffer } from "node:buffer";

/**
 * Le BL **chiffré** du retrait que le comptoir vient de remettre, en PDF à
 * imprimer pour le client (plan du jour J, lot L6). Sans numéro : l'écran n'a
 * pas le droit de lister les BL.
 */
export class GetCounterClientNotePdfQuery {
  constructor(readonly orderId: string) {}
}

/** Le BL servi : son numéro, pour tracer l'impression. */
export interface CounterClientNotePdf {
  readonly number: string;
  readonly bytes: Buffer;
  readonly fileName: string;
}
