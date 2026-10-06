import { HandoverRefusedError } from "../errors/handover-errors.js";

/** Ce qu'une remise à la porte joint à son attestation. */
export interface HandoverProofState {
  readonly orderId: string;
  /** Le nom tapé de qui a réceptionné ; `null` : personne (le dépôt, B2). */
  readonly receiverName: string | null;
  readonly photoKey: string;
  readonly signatureKey: string | null;
  readonly recordedBy: string;
  readonly recordedAt: Date;
}

/**
 * **Les pièces d'une remise à la porte** (`a-la-porte.md`, B1, § 9,
 * L6-C9) — elles appartiennent au retrait, comme l'attestation qu'elles
 * prouvent.
 *
 * La photo est un champ OBLIGATOIRE du type : une remise à la porte sans
 * photo n'est pas exprimable (§ 9). Le nom, sa longueur et la signature
 * exigée sont les règles du GESTE, tenues par la livraison qui le reçoit
 * (`DoorstepReceipt`) ; ici, on ne grave pas une pièce sans clé ni auteur.
 */
export class HandoverProof {
  private constructor(readonly state: HandoverProofState) {}

  /** @throws {HandoverRefusedError} une clé d'image ou l'auteur manque. */
  static attach(state: HandoverProofState): HandoverProof {
    if (state.photoKey === "" || state.signatureKey === "") {
      throw new HandoverRefusedError("Une pièce de remise sans image rangée n'est pas une preuve.");
    }
    if (state.recordedBy === "") {
      throw new HandoverRefusedError("Une remise sans auteur n'est pas une attestation.");
    }
    return new HandoverProof(state);
  }

  /** Relit des pièces déjà gravées, sans repasser par la règle. */
  static rehydrate(state: HandoverProofState): HandoverProof {
    return new HandoverProof(state);
  }

  /**
   * Les images rangées au stockage — ce qu'un effacement doit retirer AVANT
   * la ligne, qui seule en garde les clés.
   */
  imageKeys(): readonly string[] {
    const { photoKey, signatureKey } = this.state;
    return signatureKey === null ? [photoKey] : [photoKey, signatureKey];
  }
}
