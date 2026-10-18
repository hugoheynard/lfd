import type { CatalogReemissionJobSnapshot } from "../entities/catalog-reemission-job.js";

/**
 * **Le port de lecture des réémissions** — ce que l'écran suit.
 *
 * Rend l'état rangé, sans comportement : une vue ne garantit rien, et rien ne
 * s'écrit à partir d'elle.
 */
export abstract class ReemissionJobReader {
  /** La plus récente, toutes portées confondues ; `null` s'il n'y en a jamais eu. */
  abstract latest(): Promise<CatalogReemissionJobSnapshot | null>;

  abstract byId(id: string): Promise<CatalogReemissionJobSnapshot | null>;
}
