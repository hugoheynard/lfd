import type { MailPreferenceDetailView, MailPreferenceListItemView } from "@lfd/contracts";

import { maskRecipient } from "../../sends/domain/services/recipient-mask.js";
import type { MarketingPreferenceSnapshot } from "../domain/entities/marketing-preference-state.js";

function isoOrNull(at: Date | null): string | null {
  return at === null ? null : at.toISOString();
}

/**
 * Une ligne du registre telle que la liste du staff la sert (lot C4) :
 * l'adresse MASQUÉE comme au suivi des envois, `null` une fois effacée.
 */
export function toPreferenceListItem(
  state: MarketingPreferenceSnapshot,
): MailPreferenceListItemView {
  return {
    id: state.id,
    space: state.space,
    status: state.status,
    recipient: state.recipientKey === null ? null : maskRecipient(state.recipientKey),
    origin: state.origin,
    place: state.proof?.place ?? null,
    requestedAt: isoOrNull(state.requestedAt),
    confirmedAt: isoOrNull(state.confirmedAt),
    unsubscribedAt: isoOrNull(state.unsubscribedAt),
    unsubscribedSource: state.unsubscribedSource,
  };
}

/** Le détail : la ligne, et la preuve de l'accord (version et langue du texte, lieu, acte). */
export function toPreferenceDetail(state: MarketingPreferenceSnapshot): MailPreferenceDetailView {
  const { proof } = state;
  return {
    ...toPreferenceListItem(state),
    proof:
      proof === null
        ? null
        : {
            textVersion: proof.textVersion,
            locale: proof.locale,
            place: proof.place,
            ref: proof.ref,
          },
  };
}
