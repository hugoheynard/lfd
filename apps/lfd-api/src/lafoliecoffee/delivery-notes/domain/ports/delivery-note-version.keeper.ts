import type { DeliveryNoteVersionCause } from "../services/delivery-note-version.js";

/** Le bon dont une version se fige : de quoi le retrouver pour le composer. */
export interface KeptDeliveryNote {
  readonly id: string;
  readonly orderId: string;
  readonly number: string;
}

/**
 * **Fige une version d'un bon** quand elle devient courante (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 ter) —
 * appelé par le dépôt des bons, sous l'écriture, dans la même transaction :
 * aucun écrivain ne peut l'oublier.
 *
 * L'implémentation compose le BL client avec LE MÊME composeur que la route
 * du PDF : la version figée est le papier qu'on aurait imprimé à cet instant.
 * Une version déjà figée n'est pas réécrite.
 */
export abstract class DeliveryNoteVersionKeeper {
  abstract keep(
    note: KeptDeliveryNote,
    contentVersion: number,
    cause: DeliveryNoteVersionCause,
  ): Promise<void>;
}
