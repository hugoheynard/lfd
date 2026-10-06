import type { BillingAddressPayload, GpsPoint, MyDeliveryStopView } from '@lfd/contracts';

/**
 * **Partir vers les arrêts** — les liens de navigation de « Ma tournée »
 * (`documentation/livraisons/plan-ma-tournee.md`, MT-D6 ;
 * `gps-y-aller-et-position.md`, YA-D1 à YA-D3).
 *
 * Tout est pur : aucune lecture du téléphone ni de l'horloge, sauf le choix
 * d'application, lu et écrit par un stockage passé en paramètre.
 */

/**
 * Les étapes d'un lien Google Maps, destination non comprise. Documentation
 * Google relue le 2026-10-01 : « up to three waypoints supported on mobile
 * browsers, and a maximum of nine waypoints supported otherwise » — et le lien
 * doit marcher partout (MT-Q3).
 */
export const MAX_WAYPOINTS = 3;

/** La longueur au-delà de laquelle Google ne garantit plus un lien (« 2 048 caractères »). */
export const MAX_URL_LENGTH = 2048;

const GOOGLE_DIR = 'https://www.google.com/maps/dir/?api=1';
/** Le séparateur d'étapes, `|`, encodé comme Google le demande. */
const WAYPOINT_SEPARATOR = '%7C';

/** Les applications proposées pour « Y aller ». */
export type NavigationApp = 'google' | 'waze' | 'apple';

export const NAVIGATION_APPS: readonly { readonly value: NavigationApp; readonly label: string }[] =
  [
    { value: 'google', label: 'Google Maps' },
    { value: 'waze', label: 'Waze' },
    { value: 'apple', label: 'Plans' },
  ];

/** La clé du choix d'application, sur l'appareil (YA-D3 : pas en base). */
export const NAVIGATION_APP_KEY = 'lfd.livraison.navigation-app';

/** Où aller : un point GPS, sinon une adresse. */
export interface NavigationTarget {
  readonly gps: GpsPoint | null;
  readonly address: BillingAddressPayload | null;
}

/**
 * Les arrêts restants (YA-D1) : dans l'ordre de passage, sans ceux qui sont
 * clos. `closedAt` est écrit par `closeStop` : la clôture sans remise, la
 * remise, le dépôt et la décision « Rapporter » d'un commercial — vérifié le
 * 2026-10-06. La chaîne geste → relecture → liens est éprouvée de bout en bout
 * (YA3 : `delivery-gesture-position.e2e-spec.ts`, `my-round-page.spec.ts`).
 */
export function remainingStops(
  stops: readonly MyDeliveryStopView[],
): readonly MyDeliveryStopView[] {
  return [...stops.filter((stop) => stop.closedAt === null)].sort((a, b) => a.rank - b.rank);
}

/** L'adresse sur une ligne, telle qu'une application de carte la cherche. */
export function addressTextOf(address: BillingAddressPayload): string {
  return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(', ');
}

/**
 * L'étape d'un lien, déjà encodée : « lat,lng » quand le point est connu (plus
 * sûr en montagne), sinon l'adresse en texte ; `null` quand il n'y a ni l'un
 * ni l'autre — l'arrêt ne peut pas entrer dans un lien.
 */
export function placeOf(target: NavigationTarget): string | null {
  if (target.gps !== null) {
    return `${String(target.gps.lat)},${String(target.gps.lng)}`;
  }
  if (target.address === null) {
    return null;
  }
  const text = addressTextOf(target.address);
  return text === '' ? null : encodeURIComponent(text);
}

/**
 * **Où conduire** pour un arrêt (`gps-y-aller-et-position.md`, §6) : le
 * point de STATIONNEMENT quand le carnet en a un, sinon la porte (le point
 * GPS), sinon l'adresse. Une application de navigation est un guidage en
 * voiture : la viser sur une porte au fond d'une cour piétonne fait tourner
 * autour du pâté ; viser l'endroit où l'on se gare, puis finir à pied
 * ({@link walkToDoorHref}), est ce que le livreur fait de toute façon.
 */
export function driveTargetOf(stop: MyDeliveryStopView): NavigationTarget {
  return { gps: stop.parking ?? stop.gps, address: stop.address };
}

/**
 * Le dernier tronçon, à pied, du stationnement à la porte — `null` quand l'un
 * des deux manque : « Y aller » vise alors déjà la porte.
 */
export function walkToDoorHref(stop: MyDeliveryStopView): string | null {
  if (stop.parking === null || stop.gps === null) {
    return null;
  }
  const origin = `${String(stop.parking.lat)},${String(stop.parking.lng)}`;
  const door = `${String(stop.gps.lat)},${String(stop.gps.lng)}`;
  return `${GOOGLE_DIR}&origin=${origin}&destination=${door}&travelmode=walking`;
}

/** Un tronçon de « Toute la tournée ». */
export interface NavigationLeg {
  readonly href: string;
  /** Le rang du premier et du dernier arrêt du tronçon (origine non comprise). */
  readonly firstRank: number;
  readonly lastRank: number;
}

function legHref(origin: string | null, waypoints: readonly string[], destination: string): string {
  const parts = [GOOGLE_DIR];
  if (origin !== null) {
    parts.push(`origin=${origin}`);
  }
  parts.push(`destination=${destination}`);
  if (waypoints.length > 0) {
    parts.push(`waypoints=${waypoints.join(WAYPOINT_SEPARATOR)}`);
  }
  parts.push('travelmode=driving');
  return parts.join('&');
}

/**
 * **« Toute la tournée »** : les arrêts restants, découpés en liens Google
 * Maps (YA-D2).
 *
 * La règle :
 * - un tronçon couvre au plus `MAX_WAYPOINTS` étapes **+ 1 destination**,
 *   soit 4 arrêts ;
 * - le premier n'a pas d'`origin` : le téléphone part de sa position ;
 * - le suivant part du dernier arrêt du précédent (`origin` = ce point), qui
 *   n'est donc pas recompté : il couvre les 4 arrêts SUIVANTS ;
 * - un lien qui dépasserait `MAX_URL_LENGTH` (des adresses en texte longues)
 *   perd des étapes jusqu'à tenir — le tronçon est plus court, il y en a plus.
 *
 * Ainsi 7 arrêts font 2 tronçons (1→4, puis 4→5…7), 8 arrêts aussi
 * (1→4, puis 4→5…8), 9 arrêts en font 3.
 *
 * Un arrêt sans point ni adresse n'entre dans aucun lien : on ne sait pas où
 * il est. L'écran le dit à part.
 */
export function routeLegs(stops: readonly MyDeliveryStopView[]): readonly NavigationLeg[] {
  const places = stops.flatMap((stop) => {
    const place = placeOf(driveTargetOf(stop));
    return place === null ? [] : [{ rank: stop.rank, place }];
  });
  const legs: NavigationLeg[] = [];
  let origin: string | null = null;
  let index = 0;
  while (index < places.length) {
    let count = Math.min(MAX_WAYPOINTS, places.length - index - 1);
    let href = '';
    for (; count >= 0; count -= 1) {
      const waypoints = places.slice(index, index + count).map(({ place }) => place);
      href = legHref(origin, waypoints, places[index + count]?.place ?? '');
      // Sans étape, le lien est le plus court possible : on le garde, même trop long.
      if (href.length <= MAX_URL_LENGTH || count === 0) {
        break;
      }
    }
    const last = places[index + count];
    legs.push({ href, firstRank: places[index]?.rank ?? 0, lastRank: last?.rank ?? 0 });
    origin = last?.place ?? null;
    index += count + 1;
  }
  return legs;
}

/**
 * **« Y aller »** : un seul arrêt, dans l'application choisie (YA-D1, YA-D3).
 * `null` quand l'arrêt n'a ni point ni adresse.
 */
export function goToHref(app: NavigationApp, target: NavigationTarget): string | null {
  const place = placeOf(target);
  if (place === null) {
    return null;
  }
  switch (app) {
    case 'google':
      return `${GOOGLE_DIR}&destination=${place}&travelmode=driving`;
    case 'waze':
      return target.gps === null
        ? `https://waze.com/ul?q=${place}&navigate=yes`
        : `https://waze.com/ul?ll=${place}&navigate=yes`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${place}&dirflg=d`;
  }
}

function isNavigationApp(value: string | null): value is NavigationApp {
  return NAVIGATION_APPS.some((app) => app.value === value);
}

/**
 * Le choix mémorisé, Google Maps par défaut. Un stockage refusé (navigation
 * privée, quota) ne casse rien : on retombe sur le défaut.
 */
export function readNavigationApp(storage: Pick<Storage, 'getItem'> | null): NavigationApp {
  try {
    const value = storage?.getItem(NAVIGATION_APP_KEY) ?? null;
    return isNavigationApp(value) ? value : 'google';
  } catch {
    return 'google';
  }
}

/** Mémorise le choix ; un stockage refusé l'oublie sans rien dire — il vaut pour la page. */
export function writeNavigationApp(
  storage: Pick<Storage, 'setItem'> | null,
  app: NavigationApp,
): void {
  try {
    storage?.setItem(NAVIGATION_APP_KEY, app);
  } catch {
    // Le choix reste celui de la page ouverte.
  }
}
