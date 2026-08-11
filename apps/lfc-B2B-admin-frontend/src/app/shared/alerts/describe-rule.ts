import type { AlertDelivery, AlertRule, AlertThresholdTier } from '@lfd/contracts';

/**
 * Une règle **résumée en quelques lignes lisibles** — ce que la fiche d'un compte
 * rappelle du réglage global.
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
  if (params.kind === 'product.first_order') {
    return [`À partir de la ${params.minPreviousOrders + 1}ᵉ commande du compte`];
  }
  if (params.kind === 'product.quantity_drift') {
    return [
      `${DIRECTIONS[params.direction]}, sur sa moyenne des ${params.baselineOrders} dernières commandes du produit (au moins ${params.minBaselineOrders})`,
      describeTiers(params.tiers),
    ];
  }
  return [
    `Norme du produit sur ${params.windowDays} jours, au moins ${params.minSampleLines} lignes observées`,
    params.onlyWithoutAccountBaseline
      ? 'Seulement quand le compte n’a pas encore sa propre moyenne'
      : 'Y compris quand le compte a déjà sa propre moyenne',
    describeTiers(params.tiers),
  ];
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
