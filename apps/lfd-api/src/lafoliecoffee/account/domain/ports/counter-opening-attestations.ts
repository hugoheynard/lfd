import type { ContactSnapshot } from "../value-objects/contact-details.js";
import type { IdentityAttestation } from "../value-objects/identity-attestation.js";

/**
 * **La trace d'ouverture d'un compte au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.1, § 3.5) — écriture seule, une fois : la base refuse toute réécriture
 * (déclencheur append-only), cocher engage l'agent.
 *
 * La trace nomme aussi l'**acheteur** : le contact donné à l'ouverture, rangé
 * en fiche invité (sans identité de connexion) et sans rattachement à la
 * société. Il désigne au nom de qui l'équipe commande ; il n'ouvre l'espace
 * à personne.
 */
export abstract class CounterOpeningAttestations {
  /**
   * Range la trace du compte `companyId` et la fiche invité de son acheteur,
   * dans la transaction de l'appelant.
   */
  abstract record(
    companyId: string,
    attestation: IdentityAttestation,
    buyer: ContactSnapshot,
  ): Promise<void>;
}
