import type { OrderCutoffPayload, OrderCutoffView } from "@lfd/contracts";

/**
 * Port des **règles d'heure limite**. Un CRUD nu, sans mur : ces règles sont
 * **globales** (comme les points de retrait), pas rattachées à une entreprise —
 * la porte est celle du staff, tenue par le contrôleur.
 */
export abstract class OrderCutoffRepository {
  /** Toutes les règles, **de la plus spécifique à la plus générale**. */
  abstract list(): Promise<readonly OrderCutoffView[]>;

  abstract create(payload: OrderCutoffPayload): Promise<string>;

  abstract update(id: string, payload: OrderCutoffPayload): Promise<void>;

  abstract remove(id: string): Promise<void>;
}
