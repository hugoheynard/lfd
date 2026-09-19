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

  /**
   * Supprime la règle et rend ce qu'elle décidait : la ligne disparaît, et le
   * journal est la seule place où la règle survivra (lot B du plan des
   * phrases, 2026-09-19).
   *
   * @throws {OrderCutoffNotFoundError} l'`id` n'existe pas.
   */
  abstract remove(id: string): Promise<OrderCutoffView>;
}
