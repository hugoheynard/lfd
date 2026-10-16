import { type CustomerAudience, pickupOpenTo, type SiteView } from '@lfd/contracts';

/**
 * Une clientèle sans site de retrait, telle que Réglages › Sites la signale.
 *
 * `alert` quand la livraison lui est aussi fermée : elle ne peut plus
 * commander du tout.
 */
export interface PickupGap {
  readonly audience: CustomerAudience;
  readonly variant: 'warning' | 'alert';
  readonly message: string;
}

/** À qui la livraison est proposée ; `null` tant que le réglage n'est pas lu. */
export interface DeliveryOpenness {
  readonly b2b: boolean;
  readonly b2c: boolean;
}

/** Les mots d'une clientèle, dans l'ordre où l'écran les dit. */
const AUDIENCES: readonly { readonly audience: CustomerAudience; readonly name: string }[] = [
  { audience: 'b2c', name: 'particuliers' },
  { audience: 'b2b', name: 'pros' },
];

/**
 * **Les clientèles sans aucun site actif ouvert au retrait** (Hugo,
 * 2026-10-16). Depuis la fin du site par défaut, rien ne garantit qu'un site
 * reste ouvert au retrait d'une clientèle ; on ne bloque pas, on le montre.
 *
 * La règle est celle du `where` de `PickupAddressRepository.list(audience)`
 * au serveur : un site proposé fait le retrait, n'est pas archivé, et remet à
 * la clientèle (`pickupOpenTo`). Le réglage de livraison non lu (`null`)
 * n'aggrave rien : l'écran ne crie pas sur une supposition.
 */
export function pickupGaps(
  sites: readonly SiteView[],
  delivery: DeliveryOpenness | null,
): readonly PickupGap[] {
  return AUDIENCES.filter(
    ({ audience }) =>
      !sites.some(
        (site) => site.pickup && site.archivedAt === null && pickupOpenTo(site, audience),
      ),
  ).map(({ audience, name }) =>
    delivery !== null && !delivery[audience]
      ? {
          audience,
          variant: 'alert',
          message: `Les ${name} ne peuvent plus commander : ni retrait, ni livraison.`,
        }
      : {
          audience,
          variant: 'warning',
          message: `Aucun site de retrait pour les ${name} : le retrait ne leur est pas proposé.`,
        },
  );
}
