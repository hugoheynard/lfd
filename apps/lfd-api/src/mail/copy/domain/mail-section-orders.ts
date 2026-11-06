import type { MailCopySource } from "./mail-copy-locale.js";
import type { MailCopyManifest } from "./mail-copy-manifest.js";
import type { MailSectionOrderState } from "./mail-section-order.js";
import { keepsSections } from "./mail-section-order-rule.js";

/** L'ordre des sections qui remplace celui du code : e-mail → sections. */
export type SectionOrdersByMail = Readonly<Record<string, readonly string[]>>;

/**
 * **Les ordres qui remplacent celui du code**, pour une source (plan
 * `plan-textes-des-e-mails.md`, E4, S3) — la règle des textes
 * (`replacementTexts`) appliquée aux ordres :
 *
 * - `published` : l'ordre publié ;
 * - `draft` : le brouillon `set`, rien pour un `reset`, le publié sinon.
 *
 * Seuls les ordres qui tiennent encore contre les sections que CE code
 * déclare en sortent : une section ajoutée ou retirée depuis la publication
 * fait revenir l'e-mail à l'ordre du code, plutôt qu'à un ordre à trous.
 */
export function replacementSectionOrders(
  states: readonly MailSectionOrderState[],
  manifest: MailCopyManifest,
  source: MailCopySource,
): SectionOrdersByMail {
  const orders: Record<string, readonly string[]> = {};
  for (const state of states) {
    const order = orderOf(state, source);
    const layout = manifest.layoutOf(state.mail);
    if (order !== null && layout !== null && keepsSections(layout, order)) {
      orders[state.mail] = order;
    }
  }
  return orders;
}

function orderOf(state: MailSectionOrderState, source: MailCopySource): readonly string[] | null {
  if (source === "published") {
    return state.publishedOrder;
  }
  switch (state.draft.state) {
    case "set":
      return state.draft.order;
    case "reset":
      return null;
    case "unchanged":
      return state.publishedOrder;
  }
}
