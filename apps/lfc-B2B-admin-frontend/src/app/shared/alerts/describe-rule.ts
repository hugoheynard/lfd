import type { AlertDelivery, AlertRule, AlertThresholdTier } from '@lfd/contracts';

/**
 * Une règle **résumée en quelques lignes lisibles** — ce que la fiche d'un compte
 * rappelle du réglage global, et ce qu'elle affiche du réglage propre au compte.
 *
 * Le rappel est la raison d'être de cet écran : sans lui, on lirait « ce compte
 * déroge » sans savoir à quoi. Purement présentationnel — aucune décision ne se
 * prend ici, la résolution vit côté serveur.
 */
export function describeRule(rule: AlertRule): string[] {
  return [...describeParams(rule), describeDelivery(rule.delivery)];
}

function describeParams(rule: AlertRule): string[] {
  const params = rule.params;
  switch (params.kind) {
    case 'product.first_order':
      return [`À partir de la ${params.minPreviousOrders + 1}ᵉ commande du compte`];
    case 'product.quantity_drift':
      return [
        `${DIRECTIONS[params.direction]}, sur sa moyenne des ${params.baselineOrders} dernières commandes du produit (au moins ${params.minBaselineOrders}, sur ${params.windowDays} jours)`,
        `Hausse — ${describeTiers(params.riseTiers)}`,
        // La baisse n'est montrée que si elle est surveillée : afficher un
        // barème inopérant ferait croire à une surveillance qui n'existe pas.
        ...(params.direction === 'up' ? [] : [`Baisse — ${describeTiers(params.dropTiers)}`]),
      ];
    case 'product.quantity_outlier':
      return [
        `Médiane du produit sur ${params.windowDays} jours, au moins ${params.minSampleLines} lignes observées`,
        params.onlyWithoutAccountBaseline
          ? 'Seulement quand le compte n’a pas encore sa propre moyenne'
          : 'Y compris quand le compte a déjà sa propre moyenne',
        `Hausse — ${describeTiers(params.riseTiers)}`,
      ];
    default:
      return [
        describeWatched(params.watchQuantities, params.watchRecurrence, params.watchFulfillment),
      ];
  }
}

const DIRECTIONS = {
  both: 'Hausse et baisse',
  up: 'Hausse seulement',
  down: 'Baisse seulement',
} as const;

/** `jusqu’à 2 : 200 % · jusqu’à 10 : 100 % · au-delà : 25 %` */
function describeTiers(tiers: readonly AlertThresholdTier[]): string {
  return tiers
    .map((tier) =>
      tier.upToQuantity === null
        ? `au-delà : ${tier.thresholdPercent} %`
        : `jusqu’à ${tier.upToQuantity} : ${tier.thresholdPercent} %`,
    )
    .join(' · ');
}

function describeWatched(quantities: boolean, recurrence: boolean, fulfillment: boolean): string {
  const facets = [
    quantities ? 'quantités' : null,
    recurrence ? 'fréquence' : null,
    fulfillment ? 'acheminement' : null,
  ].filter((facet): facet is string => facet !== null);
  return `Surveille : ${facets.join(', ')}`;
}

/**
 * Le journal du compte n'est **pas** un canal : il est inconditionnel. Une règle
 * sans canal coché n'est donc pas muette, elle est discrète — et le dire évite de
 * cocher une case pour « qu'il se passe quelque chose ».
 */
function describeDelivery(delivery: AlertDelivery): string {
  const channels = [
    delivery.staffInApp ? 'notification' : null,
    delivery.staffEmail ? 'e-mail' : null,
    delivery.customerVisible ? 'visible du client' : null,
  ].filter((channel): channel is string => channel !== null);
  return channels.length === 0
    ? 'Inscrite au dossier seulement — personne n’est prévenu'
    : `Inscrite au dossier, plus : ${channels.join(', ')}`;
}
