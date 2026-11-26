import type { CompanyFollowAspect } from "@lfd/contracts";

import {
  BillingFollowAcrossInHouseError,
  InHousePayerBecomesPublicError,
} from "../errors/in-house-payer-errors.js";

/**
 * **Un suivi `billing` relie deux comptes de même nature « maison »**
 * (`plan-restaurants-maison.md`, D3) : sans quoi un site serait facturé au
 * nom d'un restaurant qui ne facture pas, ou l'inverse. Les autres aspects
 * ne disent rien du règlement : ils passent.
 *
 * @throws {BillingFollowAcrossInHouseError}
 */
export function ensureBillingFollowKeepsInHouse(input: {
  readonly aspect: CompanyFollowAspect;
  readonly parentId: string;
  readonly childInHouse: boolean;
  readonly parentInHouse: boolean;
}): void {
  if (input.aspect === "billing" && input.childInHouse !== input.parentInHouse) {
    throw new BillingFollowAcrossInHouseError(input.parentId);
  }
}

/**
 * **Un organisme public n'est pas maison** : une correction de forme ne fait
 * pas d'un restaurant maison un organisme public.
 *
 * @throws {InHousePayerBecomesPublicError}
 */
export function ensureInHouseStaysPrivate(input: {
  readonly companyId: string;
  readonly inHouse: boolean;
  readonly isPublicAfter: boolean;
}): void {
  if (input.inHouse && input.isPublicAfter) {
    throw new InHousePayerBecomesPublicError(input.companyId);
  }
}
