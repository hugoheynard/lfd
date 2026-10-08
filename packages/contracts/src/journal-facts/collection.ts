import { z } from "zod";

import { cents, count, day, fact, instant, named, payload, subjectLabel } from "./fact.js";

/**
 * **Le lot de prélèvement figé** (plan
 * `documentation/comptabilite/prelevement/plan-lot-de-prelevement-fige.md`, §2) — rangé
 * dans la famille `accounting`, où l'étale `accounting.ts`.
 *
 * Sujet d'un geste sur un lot : `collection_batch`, nommé « Lot <schéma>
 * <cycle> ». Sujet de « réglée autrement » : la commande, nommée par son
 * numéro. Jamais un IBAN ni une RUM en clair ici : un lot se reconnaît à son
 * entité, son schéma et son cycle.
 */

const sepaScheme = () => z.enum(["CORE", "B2B"]);

const batch = {
  subjectLabel: subjectLabel(),
  legalEntity: named("legal_entity"),
  scheme: sepaScheme(),
  /** La clôture du cycle — exclusive. */
  cycleClosesAt: instant(),
  lineCount: count(),
  totalCents: cents(),
};

const statement = {
  subjectLabel: subjectLabel(),
  legalEntity: named("legal_entity"),
  /** La société payeuse — celle que la ligne débite. */
  payer: named("company"),
  /** Le lot de la ligne, nommé « Lot <schéma> <cycle> ». */
  batch: named("collection_batch"),
  lineRank: count(),
  totalCents: cents(),
};

/** Une pièce émise : son numéro, ses parties du jour, son jour, ses bons, son TTC. */
const issuedInvoice = {
  subjectLabel: subjectLabel(),
  legalEntity: named("legal_entity"),
  payer: named("company"),
  issuedOn: day(),
  orderCount: count(),
  totalCents: cents(),
};

/**
 * L'e-mail « votre facture » (plan `plan-emission-de-la-facture.md`, E6).
 * Sujet : `invoice`, nommé par son numéro. Jamais les adresses : leur nombre.
 */
const invoiceNotice = {
  subjectLabel: subjectLabel(),
  payer: named("company"),
  recipientCount: count(),
};

/**
 * Le PDF/A-3 Factur-X d'une pièce (plan `plan-emission-de-la-facture.md`,
 * E3b). Sujet : `invoice`. Jamais la clé de stockage : sa taille, son
 * empreinte, et s'il s'agit d'une facture ou d'un avoir.
 */
const invoiceDocument = {
  subjectLabel: subjectLabel(),
  payer: named("company"),
  kind: z.enum(["invoice", "credit_note"]),
};

/**
 * L'avis de prélèvement d'un payeur (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA2). Sujet :
 * `collection_notice`, nommé « Avis <payeur> ». Jamais l'adresse du
 * destinataire : on dit d'où elle vient (`recipientSource`), pas laquelle.
 */
const notice = {
  subjectLabel: subjectLabel(),
  legalEntity: named("legal_entity"),
  payer: named("company"),
  kind: z.enum(["notice", "correction", "cancellation", "unchanged"]),
  /** Le montant annoncé — pour une annulation, celui qui ne sera pas prélevé. */
  amountCents: cents(),
  collectionDay: day(),
  /** Ce que le dernier avis parti annonçait, pour un rectificatif. */
  previousAmountCents: cents().nullable(),
  previousCollectionDay: day().nullable(),
  recipientSource: z.enum(["billing_contact", "owner"]).nullable(),
};

/**
 * Une tentative de la constitution automatique (plan
 * `prelevement-automatique.md`, PA3). Sujet : l'entité émettrice,
 * nommée par sa raison sociale. Une par entité et par cycle, jamais deux.
 */
const autopilotRun = {
  subjectLabel: subjectLabel(),
  /** La clôture du cycle tenté — exclusive. */
  cycleClosesAt: instant(),
  outcome: z.enum(["constituted", "nothing_to_collect", "not_yet_open", "failed"]),
  /** Les lots préparés — zéro hors `constituted`. */
  batchCount: count(),
  /** Le refus tel quel en `failed`, l'explication sinon. */
  message: z.string().nullable(),
};

export const COLLECTION_FACTS = {
  /**
   * Un lot est constitué. `unmandatedCompanies` le rend indéposable (Q2) ;
   * `excludedCount` compte les commandes écartées par cette constitution.
   */
  "collection.batch_constituted": fact(
    payload({
      ...batch,
      depositable: z.boolean(),
      unmandatedCompanies: z.array(z.string()),
      excludedCount: count(),
    }),
  ),
  /** Annulé avant dépôt : ses commandes repassent à prélever. */
  "collection.batch_cancelled": fact(payload(batch)),
  /** Déposé à la banque : ses commandes sont prélevées. */
  "collection.batch_deposited": fact(payload(batch)),
  /** Une commande sort du prélèvement : réglée autrement, avec une note. */
  "collection.order_settled_otherwise": fact(
    payload({
      subjectLabel: subjectLabel(),
      amountCents: cents(),
      previousState: z.enum(["due", "excluded"]),
      note: z.string(),
    }),
  ),
  /**
   * L'arrêté de facturation d'une ligne de débit est figé avec la
   * constitution du lot (plan `plan-le-prelevement-suit-la-facture.md`, F3).
   * Sujet : `billing_statement`. `totalCents` est son total TTC — ce que la
   * ligne prélève ; `ordersTotalCents` la somme de ses bons.
   */
  "billing_statement.issued": fact(
    payload({
      ...statement,
      orderCount: count(),
      ordersTotalCents: cents(),
    }),
  ),
  /** Annulé avec son lot, avant dépôt : un nouvel arrêté naîtra à la reconstitution. */
  "billing_statement.cancelled": fact(payload(statement)),
  /**
   * Une facture (380) est émise et numérotée (plan
   * `plan-emission-de-la-facture.md`, E2). Sujet : `invoice` ; `subjectLabel`
   * est son numéro, `payer` le payeur légal, `totalCents` le TTC.
   */
  "invoice.issued": fact(payload(issuedInvoice)),
  /** Un avoir (381) est émis sur une facture, citée par son numéro. */
  "invoice.credit_note_issued": fact(
    payload({ ...issuedInvoice, correctedInvoice: named("invoice") }),
  ),
  /** L'e-mail « votre facture » est accepté par le fournisseur pour chaque destinataire. */
  "invoice.notice_sent": fact(payload(invoiceNotice)),
  /**
   * Personne n'a été prévenu, ou pas tout le monde : aucune adresse
   * (`recipientCount` 0), ou un refus du fournisseur. `failure` dit lequel.
   */
  "invoice.notice_failed": fact(payload({ ...invoiceNotice, failure: z.string() })),
  /** Le PDF/A-3 est rendu, rangé et attaché à la pièce — une seule fois. */
  "invoice.document_rendered": fact(
    payload({ ...invoiceDocument, byteCount: count(), sha256: z.string() }),
  ),
  /** Le rendu a échoué : la pièce reste sans PDF, `failure` dit pourquoi. */
  "invoice.document_render_failed": fact(payload({ ...invoiceDocument, failure: z.string() })),
  /** L'avis est mis en file, dans la transaction du lot — pas encore envoyé. */
  "collection.notice_queued": fact(payload(notice)),
  /** Aucune adresse : ni contact de facturation, ni détenteur. Le lot ne se dépose pas. */
  "collection.notice_unsendable": fact(payload(notice)),
  /** Le fournisseur a accepté l'envoi. */
  "collection.notice_sent": fact(payload(notice)),
  /** Le fournisseur a refusé : `failure` dit pourquoi, le lot ne se dépose pas. */
  "collection.notice_failed": fact(payload({ ...notice, failure: z.string() })),
  /** L'automatisme a tenté le cycle : son issue, rangée et visible, jamais avalée. */
  "collection.autopilot_ran": fact(payload(autopilotRun)),
} as const;
