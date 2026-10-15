import type {
  GpsPoint,
  SiteRolesPayload,
  SiteSupply,
  SiteTransferMode,
  SiteView,
} from '@lfd/contracts';

/** Les rôles tels que l'écran les édite : exactement la charge du `PUT`. */
export function rolesOf(site: SiteView): SiteRolesPayload {
  return {
    pickup: site.pickup,
    // Absentes d'une API d'avant le 2026-10-15 : ouvert aux deux, l'existant.
    pickupAudiences: site.pickupAudiences ?? { b2b: true, b2c: true },
    supply: site.supply,
    deliveryDeparture: site.deliveryDeparture,
    transferMode: site.transferMode,
    counterSetupMinutes: site.counterSetupMinutes,
  };
}

/**
 * Les incohérences que le serveur refusera, dites AVANT l'envoi et avec ses
 * mots (`site-errors.ts`, relu le 2026-10-13). L'agrégat reste l'autorité :
 * ceci ne fait que l'annoncer.
 */
/** Le refus du serveur (`DepartureSiteMustDeliverError`), dit avant l'envoi. */
export const DEPARTURE_MUST_DELIVER =
  'Ce site est le point de départ des tournées : choisissez-en un autre dans Livraison › Point de départ avant de retirer « Livraison ».';

/** Le refus du serveur (`SitePickupWithoutAudienceError`), dit avant l'envoi. */
export const PICKUP_WITHOUT_AUDIENCE =
  'Un site qui fait du retrait doit l’ouvrir à au moins une clientèle : cochez « Retrait pour les pros » ou « Retrait pour les particuliers », ou décochez « Retrait ».';

export function rolesIssues(roles: SiteRolesPayload, isDeparture = false): readonly string[] {
  const issues: string[] = [];
  const audiences = roles.pickupAudiences;
  if (roles.pickup && audiences !== undefined && !audiences.b2b && !audiences.b2c) {
    issues.push(PICKUP_WITHOUT_AUDIENCE);
  }
  if (roles.supply === 'transfer' && !roles.pickup) {
    issues.push(
      'Un site approvisionné par transfert doit remettre des commandes : cochez « Retrait », ou approvisionnez-le sur place.',
    );
  }
  if (roles.deliveryDeparture && roles.supply === 'transfer') {
    issues.push(
      "Un site d'où partent les livraisons doit être approvisionné sur place : changez l'approvisionnement, ou décochez « Livraison ».",
    );
  }
  if (isDeparture && !roles.deliveryDeparture) {
    issues.push(DEPARTURE_MUST_DELIVER);
  }
  if (!Number.isInteger(roles.counterSetupMinutes) || roles.counterSetupMinutes < 0) {
    issues.push('La mise en place se compte en minutes entières, 0 ou plus.');
  }
  return issues;
}

/** Les refus du serveur, dits avant l'envoi (`site-errors.ts`, relu le 2026-10-13). */
export const DISPATCH_WITHOUT_GPS =
  'Un site qui expédie doit avoir un point GPS : saisissez sa latitude et sa longitude ci-dessous.';
export const TRANSFER_WITHOUT_GPS =
  'Un site approvisionné par transfert doit avoir un point GPS, destination du trajet : saisissez-le ci-dessous.';

/** Une ligne d'avant la règle : elle tient déjà ce rôle sans point. Signalée, pas bloquée. */
export const LEGACY_WITHOUT_GPS =
  'Ce site n’a pas de point GPS : aucune distance ne se calcule pour lui. Saisissez-le ci-dessous.';

/** Où se saisit le point : sous le rôle qui l'exige, ou nulle part. */
export type GpsPlace = 'transfer' | 'delivery' | null;

/**
 * Le point se saisit sous le PREMIER rôle qui l'exige dans l'ordre de la
 * carte — « Approvisionné par transfert », puis « Livraison » (Hugo,
 * 2026-10-13). Les deux ne coexistent pas (un site qui expédie est
 * approvisionné sur place), mais l'ordre suffit à garantir une seule saisie.
 */
export function gpsPlace(roles: SiteRolesPayload): GpsPlace {
  if (roles.supply === 'transfer') {
    return 'transfer';
  }
  return roles.deliveryDeparture ? 'delivery' : null;
}

/**
 * Ce que l'écran dit du point (Hugo, 2026-10-13). Comme l'agrégat, il ne juge
 * que la TRANSITION : prendre un rôle qui exige un point sans en avoir, ou
 * effacer celui d'un site qui le tient, est refusé ; un site qui tenait déjà
 * ce rôle sans point est signalé, pas bloqué.
 */
export function gpsNotice(
  roles: SiteRolesPayload,
  site: SiteView,
  gps: GpsPoint | null,
): { readonly blocking: boolean; readonly message: string } | null {
  const place = gpsPlace(roles);
  if (place === null || gps !== null) {
    return null;
  }
  const held = place === 'transfer' ? site.supply === 'transfer' : site.deliveryDeparture;
  if (held && site.gps === null) {
    return { blocking: false, message: LEGACY_WITHOUT_GPS };
  }
  return {
    blocking: true,
    message: place === 'transfer' ? TRANSFER_WITHOUT_GPS : DISPATCH_WITHOUT_GPS,
  };
}

/** Le point a-t-il changé ? Une absence de changement ne s'envoie pas. */
export function gpsChanged(stored: GpsPoint | null, draft: GpsPoint | null): boolean {
  return stored?.lat !== draft?.lat || stored?.lng !== draft?.lng;
}

export const SUPPLY_OPTIONS: readonly { readonly value: SiteSupply; readonly label: string }[] = [
  { value: 'on_site', label: 'Sur place — fabriqué et colisé ici' },
  { value: 'transfer', label: 'Par transfert depuis le fournil' },
];

export const TRANSFER_MODE_OPTIONS: readonly {
  readonly value: SiteTransferMode;
  readonly label: string;
}[] = [
  { value: 'integrated', label: 'Intégré à une tournée pro du jour' },
  { value: 'dedicated', label: 'Dédié — une tournée à lui' },
];
