import {
  DossierRecipientNotFoundError,
  DuplicateDossierRecipientError,
} from "../errors/dossier-recipient-errors.js";
import { emailKeyOf } from "../value-objects/recipient-email.value-object.js";
import type { DossierRecipient } from "./dossier-recipient.js";

/** Un retrait à écrire : la ligne s'archive, elle ne s'efface pas. */
export interface DossierRecipientRemoval {
  readonly recipient: DossierRecipient;
  readonly removedBy: string;
  readonly removedAt: Date;
}

/**
 * **La liste des destinataires du dossier du jour** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, décisions 3-4, lot E2).
 *
 * Son invariant : **une adresse ne figure qu'une fois**, quelle que soit la
 * forme sous laquelle elle est entrée — deux externes, une fiche deux fois, ou
 * un externe qui porte l'adresse d'une fiche déjà inscrite. Sans quoi le même
 * dossier partirait deux fois à la même boîte. L'adresse d'une fiche est celle
 * que l'annuaire donne au chargement : c'est elle qui recevrait.
 *
 * Elle retient ce qui a changé depuis le chargement ; le dépôt l'écrit.
 */
export class DossierRecipients {
  private readonly live: DossierRecipient[];
  private readonly addedSince: DossierRecipient[] = [];
  private readonly removedSince: DossierRecipientRemoval[] = [];

  private constructor(recipients: readonly DossierRecipient[]) {
    this.live = [...recipients];
  }

  /** La liste relue, fiches résolues. */
  static restore(recipients: readonly DossierRecipient[]): DossierRecipients {
    return new DossierRecipients(recipients);
  }

  get recipients(): readonly DossierRecipient[] {
    return this.live;
  }

  get added(): readonly DossierRecipient[] {
    return this.addedSince;
  }

  get removed(): readonly DossierRecipientRemoval[] {
    return this.removedSince;
  }

  /** @throws {DuplicateDossierRecipientError} la fiche ou l'adresse est déjà inscrite. */
  add(recipient: DossierRecipient): void {
    const holder = this.holderOf(recipient);
    if (holder !== null) {
      throw new DuplicateDossierRecipientError(recipient.email ?? recipient.label, holder.label);
    }
    this.live.push(recipient);
    this.addedSince.push(recipient);
  }

  /** @throws {DossierRecipientNotFoundError} l'id n'est pas dans la liste. */
  remove(id: string, removedBy: string, removedAt: Date): DossierRecipient {
    const index = this.live.findIndex((recipient) => recipient.id === id);
    const recipient = this.live[index];
    if (recipient === undefined) {
      throw new DossierRecipientNotFoundError(id);
    }
    this.live.splice(index, 1);
    this.removedSince.push({ recipient, removedBy, removedAt });
    return recipient;
  }

  /** Le destinataire déjà inscrit qui recevrait à la même adresse, ou la même fiche. */
  private holderOf(candidate: DossierRecipient): DossierRecipient | null {
    const key = candidate.email === null ? null : emailKeyOf(candidate.email);
    const staffId = candidate.target.kind === "staff" ? candidate.target.staffUserId : null;
    return (
      this.live.find(
        (recipient) =>
          (staffId !== null &&
            recipient.target.kind === "staff" &&
            recipient.target.staffUserId === staffId) ||
          (key !== null && recipient.email !== null && emailKeyOf(recipient.email) === key),
      ) ?? null
    );
  }
}
