import {
  MAIL_LOCALES,
  modelSectionOfLayoutSection,
  type MailCharter,
  type MailLocale,
  type MailTemplateDeclaration,
  type ModelSectionId,
} from "@lfd/mail-blocks";

import type { B2bMails } from "../mail-templates.js";
import { MAIL_LAYOUTS } from "./mail-layouts.js";
import type { MailLayoutDeclaration } from "./mail-layout.types.js";

type PerMail<T> = { readonly [K in keyof B2bMails]: T };

/**
 * **La charte de chaque e-mail** (plan `plan-editeur-par-blocs.md`, § 4), lue
 * dans `b2bMailTemplates` le 2026-11-07 : `customerMail` → `lfc`, `staffMail`
 * → `lfd`, et les quatre qui appellent `renderLayoutWithLogo` sans marque →
 * `internal`. Le test du même nom le revérifie en rendant chaque exemple.
 */
const CHARTERS: PerMail<MailCharter> = {
  "customer.order-ready": "lfc",
  "customer.collection-notice": "lfc",
  "customer.invoice-issued": "lfc",
  "customer.delivery-en-route": "lfc",
  "customer.order-delayed": "lfc",
  "customer.payment-failed": "lfc",
  "customer.payment-expired": "lfc",
  "customer.order-cancelled": "lfc",
  "customer.order-change-applied": "lfc",
  "customer.order-change-refused": "lfc",
  "customer.order-shortfall": "lfc",
  "customer.sub-account-activity": "lfc",
  "customer.sub-account-gesture": "lfc",
  "customer.order-payment-link": "lfc",
  "customer.order-placed": "lfc",
  "customer.mandate-to-sign": "lfc",
  "customer.access-opened": "lfc",
  "customer.company-attached": "lfc",
  "customer.order-placed-with-your-email": "lfc",
  "customer.login-method-linked": "lfc",
  "customer.password-reset": "lfc",
  "staff.invited": "lfd",
  "staff.password-reset": "lfd",
  "staff.access-suspended": "lfd",
  "staff.access-restored": "lfd",
  "staff.production-dossier": "lfd",
  "staff.customer-request": "lfd",
  "agency.vitrine-notice": "lfd",
  "staff.appointment-booked": "internal",
  "staff.account-alert": "internal",
  "ops.deploy-check": "internal",
  "staff.support-requested": "internal",
};

/**
 * Les e-mails qui partent dans la langue de leur destinataire : ceux dont les
 * données portent une `locale` (lu le 2026-11-07 ; `mailFollowsLocale` le
 * revérifie au test). Les autres partent en français seul
 * (`DEFAULT_MAIL_LOCALE`) — 21 sur 32, et non 14 comme le plan l'écrivait.
 */
const FOLLOWS_RECIPIENT_LOCALE: ReadonlySet<keyof B2bMails> = new Set<keyof B2bMails>([
  "customer.order-ready",
  "customer.order-placed",
  "customer.payment-failed",
  "customer.payment-expired",
  "customer.invoice-issued",
  "customer.delivery-en-route",
  "customer.order-delayed",
  "customer.order-cancelled",
  "customer.order-change-applied",
  "customer.order-change-refused",
  "customer.order-shortfall",
]);

const FRENCH_ONLY: readonly MailLocale[] = ["fr"];

/**
 * Les blocs du modèle d'un e-mail, tirés de ses sections déclarées (une seule
 * source) : le lien secondaire rejoint le bloc de son bouton.
 */
function modelBlocksOf(layout: MailLayoutDeclaration): readonly ModelSectionId[] {
  const blocks: ModelSectionId[] = [];
  for (const section of layout.sections) {
    const block = modelSectionOfLayoutSection(section.id);
    if (block !== null && !blocks.includes(block)) {
      blocks.push(block);
    }
  }
  return blocks;
}

/**
 * **La déclaration de chaque e-mail du registre pour l'éditeur par blocs**
 * (plan `plan-editeur-par-blocs.md`, S4a) : ses blocs du modèle dans l'ordre
 * de la coquille, ses langues, sa charte. Exhaustive : un e-mail ajouté au
 * registre sans sa charte ne compile pas. Aucune table lue.
 */
export function mailBlockDeclarationOf(mail: keyof B2bMails): MailTemplateDeclaration {
  const layout = MAIL_LAYOUTS[mail];
  return {
    modelBlocks: modelBlocksOf(layout),
    locales: FOLLOWS_RECIPIENT_LOCALE.has(mail) ? MAIL_LOCALES : FRENCH_ONLY,
    charter: CHARTERS[mail],
    ...(layout.editablePhrases === undefined ? {} : { editablePhrases: layout.editablePhrases }),
  };
}
