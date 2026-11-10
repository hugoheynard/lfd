import { Injectable } from "@nestjs/common";

import {
  CancellingMemberReader,
  type CancellingStanding,
} from "../../domain/ports/cancelling-member.reader.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";

const AUTHOR: CancellingStanding = { via: "own" };

/**
 * **Le mur de l'annulation par un client connecté** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.2).
 *
 * - commande personnelle : son auteur, et lui seul ;
 * - commande de société (saisie par l'équipe comprise) : un rattachement
 *   ACCEPTÉ sur la société DE LA COMMANDE, société `active` (B2) — jamais
 *   l'espace actif ; ou, depuis le lot C1 des sous-comptes (2026-10-21),
 *   l'`owner`/`admin` ACCEPTÉ d'un principal `active` sur la commande d'un
 *   de ses sites (`plan-commandes-des-sites.md`, §7.2).
 */
@Injectable()
export class CancellationWall {
  constructor(private readonly members: CancellingMemberReader) {}

  /** Pourquoi cette personne peut annuler, ou `null`. */
  standingOf(
    subject: CustomerCancellationSubject,
    userId: string,
  ): Promise<CancellingStanding | null> {
    if (subject.companyId === null) {
      return Promise.resolve(subject.placedByUserId === userId ? AUTHOR : null);
    }
    return this.members.standingOn(userId, subject.companyId);
  }
}
