/**
 * **« Atteste cette remise à la porte »** — ce que la livraison demande au
 * retrait quand le livreur appuie sur « Remis au client » ou « Déposé avec
 * preuve » (`documentation/livraisons/a-la-porte.md`, B1, B2, § 10 bis,
 * AP-D1, L6-C7).
 *
 * Déclaré par la livraison, implémenté par le retrait, qui garde la remise et
 * ses pièces (L6-C9) — et la règle de l'attestation, la même qu'au comptoir.
 *
 * Trois temps, dans l'ordre du geste :
 *
 * 1. `stageProofs` range les images au stockage, HORS de la transaction (un
 *    envoi n'a pas à tenir le verrou de la tournée) ;
 * 2. `attest`, DANS l'unité de travail du livreur, écrit l'attestation et ses
 *    pièces **sans rien publier**, et rend la publication ; la livraison
 *    l'inscrit après la validation (`AfterCommit`, B0) — une clôture qui
 *    échoue ne laisse ni commande `fulfilled`, ni point ;
 * 3. `discardProofs` retire les images d'une remise qui n'a pas eu lieu.
 *
 * 🔴 **L'événement ne traverse pas la frontière** (§ 10 bis) : la publication
 * est une fonction opaque. `OrderHandedOverEvent` est déclaré par
 * `handover/channels/commerce/`, que la livraison ne peut pas importer.
 */
export abstract class DoorstepHandoverAttestor {
  /** Range les images de la remise ; rend leur poignée, opaque pour la livraison. */
  abstract stageProofs(proofs: DoorstepProofImages): Promise<StagedHandoverProofs>;

  /**
   * Atteste la remise de `orderId` par `by`, et joint ses pièces. Ne publie
   * rien : rend la publication, à appeler après la validation.
   *
   * @throws le refus du retrait — commande annulée, déjà retirée, retenue —,
   *   avec sa phrase.
   */
  abstract attest(request: DoorstepHandoverRequest): Promise<HandoverPublication>;

  /**
   * La remise À LA PORTE déjà gravée pour cette commande (pièces jointes), à
   * republier — c'est le rejeu qui répare un commerce resté en arrière
   * (§ 10 bis). `null` : aucune remise à la porte — l'arrêt a été clos
   * autrement.
   */
  abstract republication(orderId: string): Promise<HandoverPublication | null>;

  /** Retire les images d'une remise qui n'a pas eu lieu. Sans effet si déjà retirées. */
  abstract discardProofs(staged: StagedHandoverProofs): Promise<void>;
}

/** Une image, ses octets relus par la livraison (format, poids). */
export interface DoorstepProofImage {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface DoorstepProofImages {
  readonly photo: DoorstepProofImage;
  /** La signature au doigt, ou `null`. */
  readonly signature: DoorstepProofImage | null;
}

/** Où les images ont été rangées — la livraison la rend telle quelle, sans la lire. */
export interface StagedHandoverProofs {
  readonly photoKey: string;
  readonly signatureKey: string | null;
}

export interface DoorstepHandoverRequest {
  readonly orderId: string;
  /** La fiche staff du livreur. */
  readonly by: string;
  /**
   * Le nom tapé de qui a réceptionné — « Remis au client » ; `null` : personne,
   * « Déposé avec preuve » (B2), attesté `deposit` au retrait (AP-D8).
   */
  readonly receiverName: string | null;
  readonly proofs: StagedHandoverProofs;
}

/** Annoncer la remise au commerce. À n'appeler qu'après la validation. */
export type HandoverPublication = () => void;
