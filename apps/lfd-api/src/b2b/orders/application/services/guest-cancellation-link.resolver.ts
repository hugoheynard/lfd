import { Injectable } from "@nestjs/common";

import { GuestCancellationLinkNotFoundError } from "../../domain/errors/customer-cancellation-errors.js";
import { CancellationLinkSigner } from "../../domain/ports/cancellation-link-signer.js";
import {
  CustomerCancellationSubjectReader,
  type CustomerCancellationSubject,
} from "../../domain/ports/customer-cancellation-subject.reader.js";
import { guestLinkIsLive } from "../../domain/services/guest-cancellation-link.js";

/**
 * **Le lien d'annulation d'un invité, vérifié** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.4).
 *
 * Le jeton IDENTIFIE la commande, il ne décide pas. Jeton faux, commande
 * inconnue, commande d'une société, ou lien de plus de 90 jours : la MÊME
 * réponse, `404` neutre. Le jeton est vérifié AVANT toute lecture : un
 * curieux n'obtient même pas un aller-retour en base.
 *
 * La fiche devenue un compte, ou désactivée (S3), n'est PAS refusée ici : la
 * page s'ouvre et dit pourquoi ; c'est le `confirm` qui refuse.
 */
@Injectable()
export class GuestCancellationLinkResolver {
  constructor(
    private readonly signer: CancellationLinkSigner,
    private readonly subjects: CustomerCancellationSubjectReader,
  ) {}

  /** @throws {GuestCancellationLinkNotFoundError} dans tous les cas où le lien ne mène nulle part. */
  async resolve(orderId: string, token: string, now: Date): Promise<CustomerCancellationSubject> {
    if (!this.signer.matches(orderId, token)) {
      throw new GuestCancellationLinkNotFoundError();
    }
    const subject = await this.subjects.find(orderId);
    if (
      subject === null ||
      subject.companyId !== null ||
      !guestLinkIsLive(subject.serviceDay, subject.placedAt, now)
    ) {
      throw new GuestCancellationLinkNotFoundError();
    }
    return subject;
  }
}
