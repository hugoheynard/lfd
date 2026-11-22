import type { MovementSubject } from "../subjects/movement-subject.js";

/** Une part d'un virement : un sujet de l'appelant, et ce que le virement en règle. */
export interface TransferPart {
  readonly subject: MovementSubject;
  readonly amountCents: number;
}

/**
 * **Un virement reçu à enregistrer**, tel que l'appelant l'a jugé. L'appelant
 * tire l'identifiant et le cite lui-même dans sa propre trace : c'est le seul
 * lien entre les deux côtés, il n'y a pas de clé étrangère entre les blocs.
 */
export interface TransferToRecord {
  readonly id: string;
  /** Opaque : l'entité qui reçoit l'argent. */
  readonly receivedInto: string;
  /** Opaque : le payeur déclaré par l'appelant. */
  readonly payerRef: string;
  readonly amountCents: number;
  /** `AAAA-MM-JJ`, le jour lu sur le relevé. */
  readonly receivedOn: string;
  readonly reference: string;
  readonly recordedAt: Date;
  /** La fiche staff qui a saisi le virement. */
  readonly recordedBy: string;
  /** Dans l'ordre de l'appelant ; leur somme fait le montant. */
  readonly parts: readonly TransferPart[];
}

/** Ce qu'un virement règle d'un sujet. */
export interface TransferAllocationView {
  readonly transferId: string;
  readonly subject: MovementSubject;
  readonly amountCents: number;
  /** `AAAA-MM-JJ`, le jour de réception du virement. */
  readonly receivedOn: string;
}

/** Un virement enregistré, et toutes ses parts. */
export interface RecordedTransferView {
  readonly id: string;
  readonly receivedInto: string;
  readonly payerRef: string;
  readonly amountCents: number;
  readonly receivedOn: string;
  readonly recordedAt: Date;
  readonly parts: readonly TransferPart[];
}

/**
 * **Le virement reçu** — déclaré ET implémenté par `payment` (plan
 * `documentation/payment/plan-le-virement-recu-dans-payment.md`, §3.1). Un
 * mouvement d'argent reçu par virement, et sa répartition sur des sujets
 * opaques. Aucun réseau : tout se joue dans la base, dans la transaction de
 * l'appelant.
 */
export abstract class BankTransfers {
  /**
   * Enregistre le virement et ses parts, **dans la transaction de
   * l'appelant** : l'appelant écrit sa propre trace dans la même, et les deux
   * tombent ensemble. Refuse ce qui contredit la règle du bloc (une part non
   * positive, un sujet cité deux fois, une somme des parts différente du
   * montant, un sujet déjà réglé par un virement).
   *
   * @throws {InvalidReceivedTransferError} saisie qui contredit la règle du bloc.
   * @throws {SubjectAlreadySettledByTransferError} un sujet déjà réglé par un virement.
   */
  abstract record(transfer: TransferToRecord): Promise<void>;

  /**
   * Par lot : pour chaque sujet réglé par un virement, le virement, la part et
   * son jour. Clé : `movementSubjectKey(subject)` ; un sujet que nul virement
   * ne règle est absent de la table.
   */
  abstract allocationsOf(
    subjects: readonly MovementSubject[],
  ): Promise<ReadonlyMap<string, TransferAllocationView>>;

  /**
   * Les virements enregistrés à partir de `since` (inclus), du plus ancien au
   * plus récent, avec leurs parts. La lecture du contrôle de cohérence.
   */
  abstract recordedSince(since: Date): Promise<readonly RecordedTransferView[]>;
}
