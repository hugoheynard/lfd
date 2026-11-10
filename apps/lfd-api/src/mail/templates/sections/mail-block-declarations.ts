import {
  MAIL_LOCALES,
  mailSpaceOfCharter,
  modelSectionOfLayoutSection,
  type MailCharter,
  type MailSpace,
  type MailLocale,
  type MailNature,
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
  "customer.order-modification-failed": "lfc",
  "customer.order-cancelled": "lfc",
  "customer.order-change-applied": "lfc",
  "customer.order-revised": "lfc",
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
  "customer.marketing-confirm": "lfc",
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
 * (`DEFAULT_MAIL_LOCALE`) — 21 sur 32, et non 14 comme le plan l'écrivait ;
 * 21 sur 33 depuis `customer.marketing-confirm` (2026-11-08), qui suit la
 * langue de la case cochée ; 21 sur 34 depuis
 * `customer.order-modification-failed` (plan S2, R13, 2026-11-10) ; 21 sur 35
 * depuis `customer.order-revised` (2026-11-10).
 */
const FOLLOWS_RECIPIENT_LOCALE: ReadonlySet<keyof B2bMails> = new Set<keyof B2bMails>([
  "customer.order-ready",
  "customer.order-placed",
  "customer.payment-failed",
  "customer.payment-expired",
  "customer.order-modification-failed",
  "customer.order-revised",
  "customer.invoice-issued",
  "customer.delivery-en-route",
  "customer.order-delayed",
  "customer.order-cancelled",
  "customer.order-change-applied",
  "customer.order-change-refused",
  "customer.order-shortfall",
  "customer.marketing-confirm",
]);

/**
 * **La nature de chaque e-mail** (doc `la-desinscription-et-l-accord.md`,
 * règle 1) : sans valeur par défaut, une clé oubliée ne compile pas. Les 35
 * sont des e-mails de service (Hugo, 2026-11-08 ; le 33ᵉ, la confirmation
 * d'inscription de C1, en est un ; le 34ᵉ, la modification payée non
 * appliquée du plan S2, aussi, comme le 35ᵉ, la commande modifiée) — l'annonce de la vitrine
 * aussi : elle informe les agences, elle ne vend rien.
 */
const NATURES: PerMail<MailNature> = {
  "customer.order-ready": "transactional",
  "customer.collection-notice": "transactional",
  "customer.invoice-issued": "transactional",
  "customer.delivery-en-route": "transactional",
  "customer.order-delayed": "transactional",
  "customer.payment-failed": "transactional",
  "customer.payment-expired": "transactional",
  "customer.order-modification-failed": "transactional",
  "customer.order-cancelled": "transactional",
  "customer.order-change-applied": "transactional",
  "customer.order-revised": "transactional",
  "customer.order-change-refused": "transactional",
  "customer.order-shortfall": "transactional",
  "customer.sub-account-activity": "transactional",
  "customer.sub-account-gesture": "transactional",
  "customer.order-payment-link": "transactional",
  "customer.order-placed": "transactional",
  "customer.mandate-to-sign": "transactional",
  "customer.access-opened": "transactional",
  "customer.company-attached": "transactional",
  "customer.order-placed-with-your-email": "transactional",
  "customer.login-method-linked": "transactional",
  "customer.password-reset": "transactional",
  // La double confirmation d'un accord (C1) : elle répond à un geste, elle
  // ne vend rien — et elle doit partir à une adresse sans accord.
  "customer.marketing-confirm": "transactional",
  "staff.invited": "transactional",
  "staff.password-reset": "transactional",
  "staff.access-suspended": "transactional",
  "staff.access-restored": "transactional",
  "staff.production-dossier": "transactional",
  "staff.customer-request": "transactional",
  "agency.vitrine-notice": "transactional",
  "staff.appointment-booked": "transactional",
  "staff.account-alert": "transactional",
  "ops.deploy-check": "transactional",
  "staff.support-requested": "transactional",
};

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
    nature: NATURES[mail],
    ...(layout.editablePhrases === undefined ? {} : { editablePhrases: layout.editablePhrases }),
    ...(layout.ctaDestination === undefined ? {} : { ctaDestination: layout.ctaDestination }),
  };
}

/**
 * **L'espace d'un e-mail** (plan `plan-editeur-par-blocs.md`, § 25) : lu de
 * sa charte, `internal` rangé dans `lfd` — aucune valeur renommée.
 */
export function mailSpaceOf(mail: keyof B2bMails): MailSpace {
  return mailSpaceOfCharter(CHARTERS[mail]);
}

/**
 * **La nature d'un e-mail** (règle 1 du plan de désinscription) : c'est elle
 * que le point d'envoi lira pour poser le pied et le contrôle (U3), et que le
 * suivi affiche. Prend la clé telle qu'elle est rangée : `null` pour une clé
 * que le registre ne connaît plus (un envoi ancien d'un modèle retiré).
 */
export function natureOf(template: string): MailNature | null {
  return hasNature(template) ? NATURES[template] : null;
}

function hasNature(template: string): template is keyof B2bMails {
  return Object.hasOwn(NATURES, template);
}

/**
 * **L'e-mail est-il à l'éditeur ?** Lu de sa déclaration (`outOfEditor`) :
 * la sonde de déploiement n'y est pas (Hugo, 2026-11-07) — elle part, elle ne
 * se rédige pas.
 */
export function isInMailEditor(mail: keyof B2bMails): boolean {
  return MAIL_LAYOUTS[mail].outOfEditor !== true;
}

/** Les e-mails du registre que l'éditeur connaît, dans l'ordre donné. */
export function editorMails(mails: readonly (keyof B2bMails)[]): readonly (keyof B2bMails)[] {
  return mails.filter(isInMailEditor);
}
