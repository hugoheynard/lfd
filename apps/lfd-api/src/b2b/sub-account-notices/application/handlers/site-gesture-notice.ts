import type { SubAccountNoticeKind } from "@lfd/contracts";

import { SiteGestureFact } from "../../../account/domain/events/site-gesture.fact.js";
import type { SubAccountGesture } from "../../../../platform/mailer/sub-account-gesture-mail.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import type { GestureNotice } from "../services/gesture-notice.dispatcher.js";

/**
 * L'avis d'un geste de site tel que son fait durable le porte — principal,
 * site et auteur FIGÉS au geste (`plan-notifications-sous-comptes.md`, N4b).
 * Partagé par les abonnés des gestes d'`account/`, un par type de fait.
 *
 * @throws {SiteGesturePayloadError} charge hors forme.
 */
export function siteGestureNotice(
  delivery: DurableDelivery,
  kind: SubAccountNoticeKind,
  gesture: SubAccountGesture,
): GestureNotice {
  const stamp = SiteGestureFact.stampOf(delivery.payload);
  return {
    eventId: delivery.eventId,
    kind,
    gesture,
    principalCompanyId: stamp.principalCompanyId,
    siteName: stamp.siteName,
    reference: null,
    authorUserId: stamp.authorUserId,
    byTeam: stamp.byTeam,
  };
}
