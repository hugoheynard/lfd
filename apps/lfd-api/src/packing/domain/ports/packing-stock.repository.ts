import type { PackingStock } from "../entities/packing-stock.js";

/**
 * **La réserve `(jour, SKU)`, en écriture** — LA ligne verrouillée du colisage
 * (§11 SÉRIEUX).
 *
 * `lock` crée la réserve vide si elle n'existe pas encore, puis la charge sous
 * `SELECT … FOR UPDATE`, dans l'unité de travail de l'appelant. `save` écrit
 * ce que l'agrégat change, sous ce verrou. Le reçu n'AVANCE que par les
 * remises du fournil, en incrément atomique ; il ne baisse que par la
 * correction du fournil (`PackingStock.correctReceived`).
 */
export abstract class PackingStockRepository {
  abstract lock(serviceDay: string, sku: string): Promise<PackingStock>;

  abstract save(stock: PackingStock): Promise<void>;
}
