import {
  longestMatchingPrefix,
  UNCOVERED_POSTAL_CODE_COMPANIES_SHOWN,
  type UncoveredPostalCodeView,
} from "@lfd/contracts";

/** Une adresse de livraison, vue par le rapprochement : son code, sa ville, son compte. */
export interface PostalCodeHolder {
  readonly postalCode: string;
  readonly city: string;
  readonly companyId: string;
  readonly companyName: string;
}

interface Bucket {
  readonly cities: Set<string>;
  readonly companies: Map<string, string>;
}

/**
 * **Les codes postaux qu'aucune zone ne couvre**, regroupés par code.
 *
 * Le rapprochement est celui du checkout — {@link longestMatchingPrefix}, la
 * règle partagée : un code est couvert dès qu'un préfixe d'une zone le préfixe.
 * Le doubler ici ferait diverger l'avertissement du refus réel
 * (`NoDeliveryZoneForPostalCodeError`). Tri : les codes qui bloquent le plus de
 * comptes d'abord, puis par code.
 */
export function uncoveredPostalCodes(
  zonePrefixes: readonly (readonly string[])[],
  holders: readonly PostalCodeHolder[],
): readonly UncoveredPostalCodeView[] {
  const prefixes = zonePrefixes.flat();
  const buckets = new Map<string, Bucket>();
  for (const holder of holders) {
    if (holder.postalCode === "" || longestMatchingPrefix(prefixes, holder.postalCode) >= 0) {
      continue;
    }
    const bucket = buckets.get(holder.postalCode) ?? { cities: new Set(), companies: new Map() };
    if (holder.city !== "") {
      bucket.cities.add(holder.city);
    }
    bucket.companies.set(holder.companyId, holder.companyName);
    buckets.set(holder.postalCode, bucket);
  }
  return [...buckets.entries()]
    .map(([postalCode, bucket]) => toView(postalCode, bucket))
    .sort((a, b) => b.companyCount - a.companyCount || a.postalCode.localeCompare(b.postalCode));
}

function toView(postalCode: string, bucket: Bucket): UncoveredPostalCodeView {
  const companies = [...bucket.companies.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return {
    postalCode,
    cities: [...bucket.cities].sort((a, b) => a.localeCompare(b, "fr")),
    companyCount: companies.length,
    companies: companies.slice(0, UNCOVERED_POSTAL_CODE_COMPANIES_SHOWN),
  };
}
