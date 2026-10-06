import { type DossierStaffCard, UNNAMED_EXTERNAL_LABEL } from "../entities/dossier-recipient.js";
import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import type { StoredDossierRecipient } from "../ports/dossier-recipients.reader.js";

/**
 * **À qui le dossier part, ce jour-là** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décision 4, lot E3).
 *
 * Une fiche du personnel se relit à l'envoi : son adresse d'aujourd'hui, son
 * nom d'aujourd'hui. Suspendue, disparue ou sans adresse, elle est écartée —
 * la liste la montre `inactive`, c'est à qui règle de la retirer. Une même
 * adresse n'est servie qu'une fois (une fiche dont l'adresse a rejoint celle
 * d'un externe depuis l'inscription), la première ligne inscrite gardant
 * l'envoi.
 */
export interface DossierAddressee {
  /** La ligne de la liste — la clé de la trace d'envoi. */
  readonly recipientId: string;
  readonly email: string;
  /** Vide quand on ne le connaît pas (un externe sans prénom). */
  readonly firstName: string;
  /**
   * « Prénom Nom », pour la trace et l'alerte ; « un destinataire externe »
   * pour un externe sans nom — jamais l'adresse.
   */
  readonly name: string;
}

/** Les destinataires servables, dans l'ordre d'inscription. */
export function dossierAddresseesOf(
  rows: readonly StoredDossierRecipient[],
  cards: ReadonlyMap<string, DossierStaffCard>,
): readonly DossierAddressee[] {
  const seen = new Set<string>();
  const out: DossierAddressee[] = [];
  for (const row of rows) {
    const addressee = addresseeOf(row, cards);
    if (addressee === null) {
      continue;
    }
    const key = addressee.email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(addressee);
    }
  }
  return out;
}

function addresseeOf(
  row: StoredDossierRecipient,
  cards: ReadonlyMap<string, DossierStaffCard>,
): DossierAddressee | null {
  if (row.kind === "external") {
    return {
      recipientId: row.id,
      email: row.email,
      firstName: row.firstName ?? "",
      name: fullName(row.firstName ?? "", row.lastName ?? "") || UNNAMED_EXTERNAL_LABEL,
    };
  }
  const card = cards.get(row.staffUserId);
  if (card === undefined || !card.active || card.email.trim() === "") {
    return null;
  }
  return {
    recipientId: row.id,
    email: card.email,
    firstName: card.firstName,
    name: fullName(card.firstName, card.lastName),
  };
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Ce que l'e-mail annonce : les commandes (par mode) et les pièces figées. */
export interface DossierCounts {
  readonly orders: number;
  readonly pickup: number;
  readonly delivery: number;
  readonly pieces: number;
}

/** Les mêmes comptes que l'en-tête du dossier (`dayDossierOf`). */
export function dossierCountsOf(orders: readonly ProductionOrderSnapshot[]): DossierCounts {
  const pickup = orders.filter((order) => order.fulfillmentMethod === "pickup").length;
  return {
    orders: orders.length,
    pickup,
    delivery: orders.length - pickup,
    pieces: orders.reduce(
      (sum, order) => sum + order.lines.reduce((lines, line) => lines + line.quantity, 0),
      0,
    ),
  };
}

/**
 * « 2 en retrait, 1 en livraison » — une part à zéro ne s'écrit pas ; vide
 * quand il n'y a aucune commande. Partagé par le papier et l'e-mail.
 */
export function methodSplitOf(pickup: number, delivery: number): string {
  const parts = [
    pickup > 0 ? `${String(pickup)} en retrait` : "",
    delivery > 0 ? `${String(delivery)} en livraison` : "",
  ];
  return parts.filter((part) => part !== "").join(", ");
}
