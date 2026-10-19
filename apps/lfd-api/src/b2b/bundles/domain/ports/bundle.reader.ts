import type { BundleSnapshot } from "../entities/bundle-shapes.js";

/**
 * Port de **lecture** des formules, pour l'écran — distinct du dépôt (ISP) :
 * lister n'a pas à pouvoir écrire. Il rend des instantanés, jamais des
 * agrégats.
 */
export abstract class BundleReader {
  /** Toutes, retirées comprises, la plus récemment écrite d'abord. */
  abstract list(): Promise<readonly BundleSnapshot[]>;

  /** Une formule par sa clé, retirée comprise, ou `null`. */
  abstract find(key: string): Promise<BundleSnapshot | null>;
}
