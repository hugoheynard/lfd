import { z } from "zod";

import { cents, count, fact, instant, named, payload, subjectLabel } from "./fact.js";

/**
 * **Le lot de prélèvement figé** (plan
 * `documentation/comptabilite/plan-lot-de-prelevement-fige.md`, §2) — rangé
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
} as const;
