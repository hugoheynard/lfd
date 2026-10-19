import type { Bundle } from "../entities/bundle.js";

/**
 * Port d'**écriture** des formules — il prend et rend l'agrégat.
 *
 * `add` et `save` sont deux gestes : `add` CRÉE, donc une clé déjà prise y
 * échoue en base même si deux onglets ont passé la vérification ensemble.
 */
export abstract class BundleRepository {
  /** La formule par sa clé, retirée comprise, ou `null`. */
  abstract load(key: string): Promise<Bundle | null>;

  /** @throws {BundleKeyTakenError} la clé est déjà prise, retirée comprise. */
  abstract add(bundle: Bundle): Promise<void>;

  /** Écrit l'état entier — groupes et choix compris, dans leur ordre. */
  abstract save(bundle: Bundle): Promise<void>;
}
