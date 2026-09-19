import type { ActorNamer } from "../../domain/ports/actor-namer.js";
import type { CustomerNamer } from "../../domain/ports/customer-namer.js";

/**
 * **Les noms que les faits d'une commande figent** (D5 et D6 du plan des
 * phrases, 2026-09-19) — partagés par les trois abonnés `order.*`.
 *
 * Tous deux **best-effort**, comme le journal qu'ils nourrissent : un annuaire
 * illisible ne perd pas le fait, il le prive d'un nom. Et aucun n'invente : un
 * nom absent reste absent.
 */

/**
 * Le libellé du sujet — la personne qui a passé la commande —, à étaler dans
 * la charge : `{ subjectLabel }` si elle a un nom, `{}` sinon.
 */
export async function customerLabel(
  customers: CustomerNamer,
  userId: string,
): Promise<{ readonly subjectLabel?: string }> {
  const name = await orNull(() => customers.nameOf(userId));
  return name === null ? {} : { subjectLabel: name };
}

/**
 * Une fiche staff citée par un fait : `{ id, name }` sous son nom du moment,
 * ou son seul id quand l'annuaire ne la nomme pas — la forme que le catalogue
 * admet pour ce cas, et celle des lignes d'avant.
 */
export async function staffCitation(
  actors: ActorNamer,
  staffUserId: string,
): Promise<{ readonly id: string; readonly name: string } | string> {
  const identity = await orNull(() => actors.describe("staff", staffUserId));
  const name = identity?.name ?? null;
  return name === null || name === "" ? staffUserId : { id: staffUserId, name };
}

async function orNull<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}
