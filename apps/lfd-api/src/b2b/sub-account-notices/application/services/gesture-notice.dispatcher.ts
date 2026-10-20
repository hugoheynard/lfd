import { Injectable } from "@nestjs/common";
import type { SubAccountNoticeKind } from "@lfd/contracts";

import type { SubAccountGesture } from "../../../../platform/mailer/sub-account-gesture-mail.js";
import { PrincipalNoticeSender } from "./principal-notice.sender.js";

/**
 * Un geste d'un site hors du cycle d'une commande, tel que son fait durable
 * le porte (`plan-notifications-sous-comptes.md`, N4 « Le choix ») : tout est
 * FIGÉ au moment du geste, rien ne se relit.
 */
export interface GestureNotice {
  /** L'identifiant du fait dans la boîte d'envoi — clé du journal d'envoi. */
  readonly eventId: string;
  readonly kind: SubAccountNoticeKind;
  readonly gesture: SubAccountGesture;
  /** Le principal du site au moment du geste, ou `null` : personne à prévenir. */
  readonly principalCompanyId: string | null;
  /** Le nom d'usage du site au moment du geste. */
  readonly siteName: string;
  /** Ce sur quoi porte le geste (un numéro de commande), ou `null`. */
  readonly reference: string | null;
  /** Le client qui a fait le geste ; `null` quand c'est l'équipe. */
  readonly authorUserId: string | null;
  readonly byTeam: boolean;
}

/**
 * **Prévenir le principal d'un geste de N4** — partagé par les abonnés des
 * faits durables de N4, un par type (`@DurableHandler` n'en écoute qu'un).
 * Il ne lit rien : le fait porte le principal figé, le nom du site et
 * l'auteur.
 */
@Injectable()
export class GestureNoticeDispatcher {
  constructor(private readonly sender: PrincipalNoticeSender) {}

  async notify(notice: GestureNotice): Promise<void> {
    if (notice.principalCompanyId === null) {
      return;
    }
    await this.sender.send(
      {
        eventId: notice.eventId,
        kind: notice.kind,
        principalId: notice.principalCompanyId,
        authorUserId: notice.authorUserId,
      },
      "customer.sub-account-gesture",
      {
        gesture: notice.gesture,
        siteName: notice.siteName,
        reference: notice.reference,
        byTeam: notice.byTeam,
      },
    );
  }
}
