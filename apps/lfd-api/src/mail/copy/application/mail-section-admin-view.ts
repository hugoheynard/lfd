import type { MailSectionOrderView, MailSectionTextView, MailSectionView } from "@lfd/contracts";

import type { MailCopyManifest } from "../domain/mail-copy-manifest.js";
import {
  defaultSectionOrder,
  type MailLayoutDescription,
  type MailSectionTextDescription,
} from "../domain/mail-section-layout.js";
import type { MailSectionOrderState } from "../domain/mail-section-order.js";
import { replacementSectionOrders } from "../domain/mail-section-orders.js";

/** Ce que l'écran lit des sections d'un e-mail (plan `plan-textes-des-e-mails.md`, E4). */
export interface MailSectionsAdminView {
  readonly frames: {
    readonly subject: readonly MailSectionTextView[];
    readonly header: readonly MailSectionTextView[];
  };
  readonly sections: readonly MailSectionView[];
  readonly sectionOrder: MailSectionOrderView;
  /** 1 si l'ordre attend « Publier », 0 sinon. */
  readonly pendingCount: number;
}

const NO_LAYOUT: MailLayoutDescription = { mail: "", subject: [], header: [], sections: [] };

/**
 * Les sections d'un e-mail et leurs trois positions — code, publié,
 * brouillon —, rangées dans l'ordre du brouillon : ce que « Publier »
 * enverra. Une position se lit dans l'ordre EFFECTIF de chaque source
 * (`replacementSectionOrders`) : un ordre que le code ne permet plus compte
 * pour l'ordre du code, comme à l'envoi.
 */
export function mailSectionsAdminView(
  mail: string,
  manifest: MailCopyManifest,
  state: MailSectionOrderState | null,
): MailSectionsAdminView {
  const layout = manifest.layoutOf(mail) ?? { ...NO_LAYOUT, mail };
  const fallback = defaultSectionOrder(layout);
  const effective = (source: "draft" | "published"): readonly string[] =>
    (state === null ? undefined : replacementSectionOrders([state], manifest, source)[mail]) ??
    fallback;
  const published = effective("published");
  const drafted = effective("draft");
  const sections = layout.sections
    .map((section) => ({
      id: section.id,
      label: section.label,
      nature: section.nature,
      texts: section.texts.map(textView),
      defaultPosition: fallback.indexOf(section.id),
      publishedPosition: published.indexOf(section.id),
      draftPosition: drafted.indexOf(section.id),
    }))
    .sort((left, right) => left.draftPosition - right.draftPosition);
  return {
    frames: { subject: layout.subject.map(textView), header: layout.header.map(textView) },
    sections,
    sectionOrder: orderView(fallback, state),
    pendingCount: state === null || state.draft.state === "unchanged" ? 0 : 1,
  };
}

function textView(text: MailSectionTextDescription): MailSectionTextView {
  return { path: text.path, variant: text.variant };
}

function orderView(
  fallback: readonly string[],
  state: MailSectionOrderState | null,
): MailSectionOrderView {
  const draft = state?.draft ?? { state: "unchanged" as const };
  return {
    draftState: draft.state,
    revision: state?.revision ?? 0,
    default: fallback,
    published: state?.publishedOrder ?? null,
    draft: draft.state === "set" ? draft.order : null,
    draftAt: state?.drafted?.at.toISOString() ?? null,
    draftBy: state?.drafted?.staffId ?? null,
  };
}
