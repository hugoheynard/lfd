import type { CatalogReemissionJob } from "../entities/catalog-reemission-job.js";

/**
 * **Le port d'écriture des réémissions** : il prend et rend l'agrégat.
 *
 * À part de {@link ReemissionJobReader} (ISP) : l'écran relit un compte rendu,
 * il ne mute rien ; le lanceur et la reprise au démarrage mutent, et lisent
 * l'agrégat pour le faire.
 */
export abstract class ReemissionJobRepository {
  /**
   * Range l'état entier du travail.
   *
   * @throws {ReemissionAlreadyRunningError} un second « tout » en cours —
   *   l'index partiel de la table l'interdit, même entre deux clics simultanés.
   */
  abstract save(job: CatalogReemissionJob): Promise<void>;

  /** Le « tout » en cours, s'il y en a un. */
  abstract runningEverything(): Promise<CatalogReemissionJob | null>;

  /** Tous les travaux encore « en cours » — à la reprise, ce sont des orphelins. */
  abstract running(): Promise<CatalogReemissionJob[]>;
}
