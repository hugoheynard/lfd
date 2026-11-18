import { isPublicLegalForm, toLegalForm } from "@lfd/contracts";

import { CompanyPublicNatureFrozenError } from "../errors/account-errors.js";
import type { CompanyStatus } from "./company-status.js";

/**
 * La forme juridique saisie est-elle celle d'un organisme public ? La nature
 * publique d'un compte EST sa forme juridique (`isPublicLegalForm`) ; une forme
 * vide ou hors catalogue n'est pas publique.
 */
export function isPublicFormeJuridique(formeJuridique: string): boolean {
  const form = toLegalForm(formeJuridique);
  return form !== null && isPublicLegalForm(form);
}

/**
 * Refuse le passage entreprise ↔ organisme public d'un compte qui n'est plus en
 * attente. L'activation précède toute commande : figer la nature à
 * l'activation la fige avant le premier engagement, sans que le compte ait à
 * lire le commerce. Une forme encore vide n'a pas de nature : la compléter est
 * libre, comme une correction à l'intérieur d'une même nature.
 *
 * @throws {CompanyPublicNatureFrozenError}
 */
export function ensurePublicNatureKept(input: {
  readonly companyId: string;
  readonly status: CompanyStatus;
  readonly before: string;
  readonly after: string;
}): void {
  if (input.status === "pending" || input.before.trim() === "") {
    return;
  }
  const wasPublic = isPublicFormeJuridique(input.before);
  const isPublic = isPublicFormeJuridique(input.after);
  if (wasPublic !== isPublic) {
    throw new CompanyPublicNatureFrozenError(input.companyId, isPublic);
  }
}
