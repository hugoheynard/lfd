import type { HealthReason } from '@lfd/ops-contract';

/**
 * **La raison, en français.** Le serveur rend un identifiant stable
 * (`deploy-broken`) parce qu'un contrat ne se traduit pas ; l'écran le rend
 * lisible, parce qu'un intitulé qu'il faut décoder n'est pas consultable.
 *
 * Le mot compte autant que la couleur : « le déploiement est cassé » et « la
 * sonde ne répond pas » envoient chercher à deux endroits différents. Table
 * exhaustive — un `HealthReason` ajouté sans son libellé ne compile pas, ce qui
 * est exactement la garantie qu'on veut ici.
 */
export const REASON_LABEL: Readonly<Record<HealthReason, string>> = {
  'gateway-fault': 'la gateway n’obtient pas de réponse',
  'error-rate': 'trop d’erreurs serveur',
  'traffic-healthy': 'sert normalement',
  'heartbeat-stale': 'ne rapporte plus',
  'heartbeat-fresh': 'rapporte normalement',
  'probe-ok': 'sonde au vert',
  'probe-failed': 'sonde en échec',
  'deploy-ok': 'servi',
  'deploy-broken': 'déploiement cassé',
  'no-evidence': 'aucune preuve',
};
