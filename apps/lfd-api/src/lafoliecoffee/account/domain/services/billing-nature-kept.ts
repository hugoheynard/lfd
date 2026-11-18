import { BillingNatureChangeAcrossFollowError } from "../errors/hierarchy-errors.js";
import type { BillingNatureNeighbours } from "../ports/billing-nature-neighbours.reader.js";
import { isPublicFormeJuridique } from "../value-objects/public-nature.js";

/**
 * **Un suivi `billing` relie deux comptes de même nature** (entreprise ou
 * organisme public), et une correction de forme ne le défait pas. Jugé
 * seulement quand la forme a changé ; une forme vide n'a pas de nature, ni
 * de ce côté ni de l'autre.
 *
 * @throws {BillingNatureChangeAcrossFollowError}
 */
export function ensureBillingNatureKept(input: {
  readonly companyId: string;
  readonly formBefore: string;
  readonly formAfter: string;
  readonly neighbours: BillingNatureNeighbours;
}): void {
  const { formAfter, neighbours } = input;
  if (formAfter === input.formBefore || formAfter.trim() === "") {
    return;
  }
  const isPublic = isPublicFormeJuridique(formAfter);
  const differs = (form: string): boolean =>
    form.trim() !== "" && isPublicFormeJuridique(form) !== isPublic;
  if (neighbours.principalForm !== null && differs(neighbours.principalForm)) {
    throw new BillingNatureChangeAcrossFollowError(input.companyId, "principal");
  }
  if (neighbours.siteForms.some(differs)) {
    throw new BillingNatureChangeAcrossFollowError(input.companyId, "sites");
  }
}
