import { Injectable } from "@nestjs/common";

import { CancellingMemberReader } from "../../domain/ports/cancelling-member.reader.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";

/**
 * **Le mur de l'annulation par un client connecté** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.2).
 *
 * - commande personnelle : son auteur, et lui seul ;
 * - commande de société (saisie par l'équipe comprise) : un rattachement
 *   ACCEPTÉ sur la société DE LA COMMANDE, société `active` (B2) — jamais
 *   l'espace actif, et aucune hérédité vers les sites.
 */
@Injectable()
export class CancellationWall {
  constructor(private readonly members: CancellingMemberReader) {}

  mayCancel(subject: CustomerCancellationSubject, userId: string): Promise<boolean> {
    if (subject.companyId === null) {
      return Promise.resolve(subject.placedByUserId === userId);
    }
    return this.members.mayCancelFor(userId, subject.companyId);
  }
}
