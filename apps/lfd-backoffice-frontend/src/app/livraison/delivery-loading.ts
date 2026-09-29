import type {
  DeliveryBinHalf,
  DeliveryBinPartnerView,
  DeliveryBinView,
  DeliveryLoadingBinView,
  DeliveryLoadingRoundView,
  DeliveryLoadingStopState,
  DeliveryLoadingStopView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';

/**
 * **Le chargement, en fonctions pures** (`plan-preparation-de-tournee.md`,
 * lot 4, v4 ; lot 4 bis, tranche B). Aucun chiffre n'est RÈGLE ici : l'état d'un arrêt vient du
 * serveur (`state`) ; on ne fait que le dire.
 *
 * Types seulement de `@lfd/contracts` : le schéma zod du code court tirerait
 * zod dans le paquet de la page pour une expression régulière.
 */

/** Le chemin qu'encode le QR d'un bac (L4-C13) — ouvrir montre, un geste charge. */
export const BIN_PATH = '/livraison/bac/';

/** L'adresse absolue d'un bac, telle qu'un appareil photo natif l'ouvrira. */
export function binUrl(origin: string, binId: string): string {
  return `${origin.replace(/\/+$/u, '')}${BIN_PATH}${encodeURIComponent(binId)}`;
}

/** Le code court : six caractères de Crockford base 32 (sans I, L, O, U) — L4-C20. */
const CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/u;

/** Un identifiant de bac dans une adresse : ce que le serveur a tiré, rien d'autre. */
const BIN_IN_URL = /\/livraison\/bac\/([A-Za-z0-9_-]+)(?:[/?#]|$)/u;

/**
 * Le code tapé, remis à la forme de Crockford : majuscules, séparateurs ôtés,
 * et les lettres que l'alphabet exclut lues comme les chiffres qu'elles imitent
 * (O → 0, I et L → 1) — c'est la règle de décodage de Crockford elle-même.
 */
export function normalisedCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, '')
    .replace(/O/gu, '0')
    .replace(/[IL]/gu, '1');
}

/**
 * **Ce qu'un code lu ou tapé désigne**, ou `null`.
 *
 * Deux formes, et rien d'autre : l'adresse d'un bac (`…/livraison/bac/{id}`,
 * le QR — d'un bac entier ou d'une moitié), ou le code court (six caractères,
 * tapé quand le QR est illisible).
 *
 * 🔴 Le refus est le point, comme `tokenOf` au comptoir : une étiquette de
 * transporteur ou la feuille d'atelier (`/colisage/…`) n'atteint jamais le
 * réseau. `tokenOf` n'est pas réutilisé — il ne lit que `/retrait/`, et c'est
 * voulu.
 */
export function scannedBin(raw: string): LoadDeliveryBinPayload | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const inUrl = BIN_IN_URL.exec(trimmed);
  if (inUrl?.[1] !== undefined) {
    return { binId: inUrl[1] };
  }
  const code = normalisedCode(trimmed);
  return CODE.test(code) ? { code } : null;
}

/** « bac 2 / 3 » — ou « bac annulé », qui n'a plus de rang. */
export function binIndexLabel(bin: Pick<DeliveryBinView, 'index' | 'total'>): string {
  return bin.index === null ? 'bac annulé' : `bac ${String(bin.index)} / ${String(bin.total)}`;
}

/** « ½ gauche », « ½ droite » — ou `null` pour un bac entier. */
export function halfLabel(half: DeliveryBinHalf | null): string | null {
  switch (half) {
    case 'left':
      return '½ gauche';
    case 'right':
      return '½ droite';
    case null:
      return null;
  }
}

/** « 2 sacs dedans », « 1 sac dedans » — ou `null` : aucun sac, rien à imprimer. */
export function innerBagsLabel(innerBags: number): string | null {
  if (innerBags <= 0) {
    return null;
  }
  return `${String(innerBags)} sac${innerBags > 1 ? 's' : ''} dedans`;
}

/** « partagé avec CMD-12 · Le Refuge » — l'autre commande d'un bac cloisonné. */
export function sharedWithLabel(
  partner: Pick<DeliveryBinPartnerView, 'reference' | 'customerLabel'>,
): string {
  return `partagé avec ${partner.reference} · ${partner.customerLabel}`;
}

/**
 * **Ce qu'un bac est, en une ligne** : « Bac M · ½ gauche · 2 sacs dedans ».
 * Le type d'abord (on le reconnaît de loin), la moitié ensuite, les sacs en
 * dernier — ils ne sont qu'un compte informatif.
 */
export function binKindLabel(
  bin: Pick<DeliveryLoadingBinView, 'binTypeName' | 'half' | 'innerBags'>,
): string {
  return [bin.binTypeName, halfLabel(bin.half), innerBagsLabel(bin.innerBags)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** Combien de bacs de l'arrêt sont déjà dans le véhicule. */
export function loadedCount(stop: Pick<DeliveryLoadingStopView, 'bins'>): number {
  return stop.bins.filter((bin) => bin.loadedAt !== null).length;
}

/** « 2 bacs sur 3 », « 1 bac sur 1 », « aucun bac déclaré ». */
export function binCountLabel(stop: Pick<DeliveryLoadingStopView, 'bins'>): string {
  const total = stop.bins.length;
  if (total === 0) {
    return 'aucun bac déclaré';
  }
  const loaded = loadedCount(stop);
  return `${String(loaded)} bac${loaded > 1 ? 's' : ''} sur ${String(total)}`;
}

/** 🔴 L'arrêt porte-t-il un bac partagé à refaire ? « Partir » le refuse (v2-4). */
export function hasBinToRedo(stop: Pick<DeliveryLoadingStopView, 'bins'>): boolean {
  return stop.bins.some((bin) => bin.toRedo);
}

export interface StopStateLabel {
  readonly label: string;
  readonly variant: 'alert' | 'warning' | 'success';
}

/** L'état d'un arrêt en toutes lettres. 🔴 `unlabelled` en rouge : « Partir » le refuse (L4-C17). */
export function stopStateLabel(state: DeliveryLoadingStopState): StopStateLabel {
  switch (state) {
    case 'unlabelled':
      return { label: 'Aucun bac déclaré', variant: 'alert' };
    case 'partial':
      return { label: 'À charger', variant: 'warning' };
    case 'loaded':
      return { label: 'Chargé', variant: 'success' };
  }
}

/** Ce qui manque encore à un arrêt, dit par référence et enseigne. */
export interface MissingStop {
  readonly stopId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /**
   * « aucun bac déclaré », « 1 bac sur 3 », ou « bac partagé à refaire » : ce
   * qui reste, en toutes lettres.
   */
  readonly detail: string;
}

/**
 * Les arrêts qui empêchent de partir, dans l'ordre de passage : ceux qui ne
 * sont pas chargés, et ceux — même chargés — qui portent un bac partagé à
 * refaire (v2-4). La règle reste au serveur ; ceci ne fait que la montrer.
 */
export function missingStops(
  round: Pick<DeliveryLoadingRoundView, 'stops'>,
): readonly MissingStop[] {
  return round.stops
    .filter((stop) => stop.state !== 'loaded' || hasBinToRedo(stop))
    .map((stop) => ({
      stopId: stop.stopId,
      reference: stop.reference,
      customerLabel: stop.customerLabel,
      detail: hasBinToRedo(stop)
        ? `bac partagé à refaire · ${binCountLabel(stop)}`
        : binCountLabel(stop),
    }));
}

/** Une moitié libre qu'une commande peut partager — ce que propose le colisage. */
export interface SharePartner {
  readonly binId: string;
  /** « CMD-12 · Le Refuge — Bac M ½ gauche · 2 sacs dedans (arrêt 3) » */
  readonly label: string;
}

/**
 * **Les moitiés qu'une commande peut partager dans une tournée** (v2-4) : les
 * demi-bacs encore seuls (sans partenaire, pas à refaire) des arrêts VOISINS
 * de celui de la commande — le serveur refuse tout autre partage, on ne le
 * propose donc pas. Vide si la commande n'est pas dans la tournée.
 */
export function sharePartners(
  round: Pick<DeliveryLoadingRoundView, 'stops'>,
  orderId: string,
): readonly SharePartner[] {
  // Voisins par RANG parmi les arrêts servis (dans l'ordre de passage), pas
  // par `position` : c'est le rang des arrêts vivants que le serveur compare.
  const at = round.stops.findIndex((stop) => stop.orderId === orderId);
  if (at === -1) {
    return [];
  }
  return [round.stops[at - 1], round.stops[at + 1]]
    .filter((stop): stop is DeliveryLoadingStopView => stop !== undefined)
    .flatMap((stop) =>
      stop.bins
        .filter((bin) => bin.half !== null && bin.sharedWithReference === null && !bin.toRedo)
        .map((bin) => ({
          binId: bin.binId,
          label: `${stop.reference} · ${stop.customerLabel} — ${binKindLabel(bin)} (arrêt ${String(stop.position)})`,
        })),
    );
}

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  minute: '2-digit',
});

/** « 7 h 42 » — l'heure de Paris d'un instant servi. */
export function parisTimeOf(iso: string): string {
  return PARIS_TIME.format(new Date(iso)).replace(':', ' h ');
}
