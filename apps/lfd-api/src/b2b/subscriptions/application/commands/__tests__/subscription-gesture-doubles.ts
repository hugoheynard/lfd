import { ReservedArticleGuard } from "../../../../catalog/application/reserved-article-guard.service.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { InMemoryReservationHolders } from "../../../../catalog/infrastructure/in-memory-reservation-holders.js";
import { recordedGestures } from "../../../../account/application/commands/__tests__/site-gesture-doubles.js";
import { CompanyNameReader } from "../../../../account/domain/ports/company-name.reader.js";
import { MembershipReader } from "../../../../account/domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../../account/domain/value-objects/company-role.js";
import type { SubscriptionRepository } from "../../../domain/ports/subscription.repository.js";
import { SubscriptionGestures } from "../../services/subscription-gestures.js";

/** Les rattachements ACTUELS, « personne/société » → rôle. */
export class FixedMemberships extends MembershipReader {
  constructor(private readonly roles: ReadonlyMap<string, CompanyRole> = new Map()) {
    super();
  }

  roleOf(userId: string, companyId: string): Promise<CompanyRole | null> {
    return Promise.resolve(this.roles.get(`${userId}/${companyId}`) ?? null);
  }
}

/** Les noms connus ; une société absente est inconnue. */
export class FixedCompanyNames extends CompanyNameReader {
  constructor(private readonly names: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  nameOf(companyId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(companyId) ?? null);
  }
}

/**
 * Le mur et l'annonce des gestes, sur un dépôt doublé : `user_1` est membre
 * actuel de `chalet` (« Chalet Gentiane »), dont le principal est `alpes`.
 */
export function subscriptionGestures(
  repository: SubscriptionRepository,
  options: { readonly member?: boolean } = {},
) {
  const recorded = recordedGestures(new Map([["chalet", "alpes"]]));
  const roles = new Map<string, CompanyRole>(
    options.member === false ? [] : [["user_1/chalet", "orders"]],
  );
  return {
    ...recorded,
    gestures: new SubscriptionGestures(
      repository,
      new FixedMemberships(roles),
      new FixedCompanyNames(new Map([["chalet", "Chalet Gentiane"]])),
      recorded.publisher,
    ),
  };
}

/**
 * La garde des articles d'un abonnement, devant un rayon public qui sert ces
 * SKU-là. Depuis le 2026-10-30, un particulier passe le mur de son rayon : un
 * catalogue vide refuserait tout panier perso.
 */
export function guardServing(...skus: readonly string[]): ReservedArticleGuard {
  return new ReservedArticleGuard(
    new InMemoryProductCatalog(
      skus.map((sku) => ({
        sku,
        name: sku,
        unitPriceMillicents: 1,
        vatRate: 5.5,
        family: null,
        allergens: null,
        orderTimeLimit: null,
      })),
    ),
    new InMemoryReservationHolders(),
  );
}
