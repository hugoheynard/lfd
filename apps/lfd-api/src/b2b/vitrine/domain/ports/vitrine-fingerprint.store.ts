import type { VitrineElementPrint } from "../services/vitrine-fingerprints.js";

/**
 * **La dernière empreinte émise**, par abonné et par élément (B3). Une table
 * de suivi et non un agrégat : rien ne peut refuser d'y écrire — c'est la
 * comparaison du domaine qui décide quoi y mettre.
 */
export abstract class VitrineFingerprintStore {
  abstract load(subscriberId: string): Promise<readonly VitrineElementPrint[]>;
  abstract record(
    subscriberId: string,
    upserts: readonly VitrineElementPrint[],
    removals: readonly Pick<VitrineElementPrint, "kind" | "key">[],
    at: Date,
  ): Promise<void>;
  /** « Tout renvoyer » : le prochain balayage verra tout comme neuf. */
  abstract forget(subscriberId: string): Promise<void>;
}
