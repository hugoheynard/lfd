import type { PackingStock } from "../entities/packing-stock.js";

/**
 * **La réserve `(jour, SKU)`, en écriture** — LA ligne verrouillée du colisage
 * (§11 SÉRIEUX).
 *
 * `lock` crée la réserve vide si elle n'existe pas encore, puis la charge sous
 * `SELECT … FOR UPDATE`, dans l'unité de travail de l'appelant. `save` n'écrit
 * que ce que l'agrégat change — au bac, rendu — : le reçu, lui, n'avance que
 * par les remises du fournil, en incrément atomique.
 */
export abstract class PackingStockRepository {
  abstract lock(serviceDay: string, sku: string): Promise<PackingStock>;

  abstract save(stock: PackingStock): Promise<void>;
}
