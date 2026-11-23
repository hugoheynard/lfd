import type { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
} from "../../domain/errors/shop-till-order-errors.js";

/**
 * **La fiche choisie par l'équipe est un particulier**, ou le refus qui nomme
 * pourquoi elle n'en est pas un : une fiche non désactivée, sans adhésion à
 * une société. Une fiche connectable créée par le client lui-même en est un.
 *
 * Le même mur pour toute commande qu'elle porte sans société : notée au
 * comptoir (`counter-particular-order-preparation.ts`) ou offerte
 * (`offered-particular-order-preparation.ts`, `plan-commande-offerte.md`, O7-2).
 *
 * @throws {CounterParticularNotFoundError} aucune fiche sous cet identifiant.
 * @throws {CounterBuyerIsCompanyMemberError} la fiche est rattachée à une société.
 * @throws {CounterParticularDisabledError} la fiche est désactivée.
 */
export async function ensureParticular(
  particulars: ParticularStandingReader,
  buyerUserId: string,
): Promise<void> {
  const standing = await particulars.standingOf(buyerUserId);
  switch (standing) {
    case "particular":
      return;
    case "company_member":
      throw new CounterBuyerIsCompanyMemberError();
    case "disabled":
      throw new CounterParticularDisabledError();
    case "unknown":
      throw new CounterParticularNotFoundError();
  }
}
