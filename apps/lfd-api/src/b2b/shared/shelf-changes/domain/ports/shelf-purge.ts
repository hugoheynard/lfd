import type { ShelfPurgeOrder } from "../shelf-purge-batch.js";

/** Une purge regroupée, et l'instant où sa fenêtre s'est ouverte. */
export interface ShelfPurgeRequest {
  readonly order: ShelfPurgeOrder;
  readonly windowOpenedAt: Date;
}

/**
 * **Ce qu'on fait d'une purge regroupée.** En C1, la journaliser ; en C2 et C3,
 * l'envoyer au magasin des rayons pro et à Workers Cache. Un port pour que
 * ces lots remplacent l'adaptateur sans toucher au regroupement.
 *
 * Une purge qui échoue n'est pas rejouée : elle est journalisée par
 * l'appelant, et la durée de vie des rayons rattrape (§ 5).
 */
export abstract class ShelfPurge {
  abstract purge(request: ShelfPurgeRequest): Promise<void>;
}
