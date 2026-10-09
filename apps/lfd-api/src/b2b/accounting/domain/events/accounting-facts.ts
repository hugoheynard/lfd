import type { JournalFactType } from "@lfd/contracts/journal-facts";

/**
 * Les **faits de la comptabilité** — ce que le journal retient de notre propre
 * identité d'émetteur.
 *
 * Tous partent par `publishTraced`, sans exception, et la raison n'est pas la
 * même que pour les comptes clients. Là-bas, on trace parce qu'un agent agit sur
 * le dossier de quelqu'un d'autre. Ici, il n'y a pas de tiers : on trace parce
 * que **chacun de ces champs finit imprimé sur un document opposable**, ou
 * décide d'où l'argent arrive. Le jour où un mandat est contesté, la question
 * n'est pas « quelle est notre adresse » mais « quelle adresse portait le papier
 * qu'il a signé, et qui l'avait saisie ».
 *
 * `creditorAccountChanged` mérite une mention à part : changer l'IBAN qui reçoit
 * est le geste que la fraude au virement vise en premier. Une trace ne l'empêche
 * pas — elle rend le détournement **racontable**, ce qui est tout ce qu'un
 * journal peut promettre.
 *
 * ⚠️ Aucun de ces payloads ne porte l'IBAN. Le journal est lu par du personnel
 * qui n'a pas à connaître le compte, et une trace se relit des années après :
 * y déposer une coordonnée bancaire, c'est la répandre dans le temps.
 */
export const ACCOUNTING_FACTS = {
  /** Une entité émettrice est déclarée — sans ICS ni compte, c'est normal. */
  legalEntityDeclared: "legal_entity.declared",
  /** Raison sociale, forme, RCS, capital, TVA ou adresse corrigés. */
  legalEntityCorrected: "legal_entity.corrected",
  /** L'ICS est attribué. **Une seule fois dans la vie de l'entité.** */
  creditorIdentifierAssigned: "legal_entity.creditor_identifier_assigned",
  /** Le compte où l'argent arrive change. */
  creditorAccountChanged: "legal_entity.creditor_account_changed",
  /** Le délai annoncé entre pré-notification et débit est renégocié. */
  preNotificationChanged: "legal_entity.pre_notification_changed",
  /** Le calendrier de prélèvement : délai de constitution, échéance N, cut-off de dépôt. */
  collectionScheduleChanged: "legal_entity.collection_schedule_changed",
  /** La constitution automatique est activée — des lots partiront sans clic. */
  autoCollectionEnabled: "legal_entity.auto_collection_enabled",
  autoCollectionDisabled: "legal_entity.auto_collection_disabled",
  /**
   * Les mentions de paiement de la facture — pénalités de retard, indemnité de
   * recouvrement, escompte (plan `facture-emise.md`).
   */
  invoicePaymentTermsChanged: "legal_entity.invoice_payment_terms_changed",
  /**
   * Le schéma des mandats à venir bascule — CORE ↔ interentreprises. Les
   * brouillons de l'entité deviennent caducs dans la même transaction ; les
   * actifs gardent le leur.
   */
  mandateSchemeChanged: "legal_entity.mandate_scheme_changed",
  /** L'entité n'émet plus rien ; ses documents passés restent. */
  legalEntityArchived: "legal_entity.archived",
  legalEntityRestored: "legal_entity.restored",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Les faits du lot de prélèvement figé (plan `lot-de-prelevement-fige.md`). */
export const COLLECTION_FACT_TYPES = {
  batchConstituted: "collection.batch_constituted",
  batchCancelled: "collection.batch_cancelled",
  batchDeposited: "collection.batch_deposited",
  orderSettledOtherwise: "collection.order_settled_otherwise",
  noticeQueued: "collection.notice_queued",
  noticeUnsendable: "collection.notice_unsendable",
  noticeSent: "collection.notice_sent",
  noticeFailed: "collection.notice_failed",
  autopilotRan: "collection.autopilot_ran",
  /** La banque a rejeté ou retourné une ligne (plan `retours-bancaires.md`). */
  returned: "collection.returned",
  returnResolved: "collection.return_resolved",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Les faits de l'export des mandats pour la banque (plan
 * `export-des-mandats-pour-la-banque.md`). Sujet : l'entité
 * émettrice ; charge : le nombre de mandats. JAMAIS un IBAN ni une RUM.
 */
export const MANDATE_BANK_EXPORT_FACT_TYPES = {
  created: "mandate_bank_export.created",
  imported: "mandate_bank_export.imported",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Les faits de l'arrêté de facturation (plan
 * `le-prelevement-suit-la-facture.md`) : émis avec la constitution
 * du lot, annulé avec lui.
 */
export const BILLING_STATEMENT_FACT_TYPES = {
  issued: "billing_statement.issued",
  cancelled: "billing_statement.cancelled",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Les faits de la facture émise (plan `facture-emise.md`) :
 * une facture, un avoir. Aucun autre ne la change — une pièce émise ne
 * change plus ; « prévenu » et « non prévenu » (E6) disent l'e-mail parti, « renvoyé »
 * le geste du staff (suite (b)),
 * « rendu » et « rendu en échec » (E3b) son PDF/A-3.
 */
export const INVOICE_FACT_TYPES = {
  issued: "invoice.issued",
  creditNoteIssued: "invoice.credit_note_issued",
  noticeSent: "invoice.notice_sent",
  noticeFailed: "invoice.notice_failed",
  noticeResent: "invoice.notice_resent",
  documentRendered: "invoice.document_rendered",
  documentRenderFailed: "invoice.document_render_failed",
} as const satisfies Readonly<Record<string, JournalFactType>>;
