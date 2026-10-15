import type { GpsPoint, PickupDiscountAudiences, PickupOpening } from "@lfd/contracts";

import type { PickupDiscount } from "../../pickup-addresses/domain/pickup-discount.js";
import type { SiteColor } from "./site-color.js";
import {
  ArchivedSiteError,
  DefaultSiteArchiveError,
  DefaultSiteMustHandOverError,
  DepartureSiteMustDeliverError,
  DeliveryDepartureSiteArchiveError,
  SiteCounterSetupError,
  SiteDeliveryDepartureFromTransferError,
  SiteDeliveryDepartureWithoutGpsError,
  SitePickupWithoutAudienceError,
  SiteTransferWithoutGpsError,
  SiteTransferWithoutHandoverError,
} from "./site-errors.js";

/** D'où vient la marchandise d'un site. */
export type SiteSupply = "on_site" | "transfer";

/** Comment un site servi par transfert est approvisionné (plan, §4). */
export type SiteTransferMode = "integrated" | "dedicated";

/** Le lieu lui-même : où il est, quand on y vient, ce qu'il remise. */
export interface SitePlace {
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly opening: PickupOpening;
  readonly gps: GpsPoint | null;
  readonly discount: PickupDiscount;
}

/**
 * À quelles clientèles un site remet en retrait (Hugo, 2026-10-15) — même
 * forme que les clientèles d'une remise.
 */
export type SitePickupAudiences = PickupDiscountAudiences;

/** Les rôles d'un site et leurs réglages (plan, §3.1 et §4.6). */
export interface SiteRoles {
  readonly pickup: boolean;
  /**
   * Les clientèles qui peuvent y retirer. Lues seulement si `pickup` : un site
   * sans retrait les garde telles quelles, comme `PickupDiscount` garde les
   * cases d'une remise retirée.
   */
  readonly pickupAudiences: SitePickupAudiences;
  readonly supply: SiteSupply;
  readonly deliveryDeparture: boolean;
  readonly transferMode: SiteTransferMode;
  readonly counterSetupMinutes: number;
}

/** Les quatre couleurs de la logistique ; `null` = pas encore saisie. */
export interface SiteColors {
  readonly pickupB2b: SiteColor | null;
  readonly pickupB2c: SiteColor | null;
  readonly deliveryB2b: SiteColor | null;
  readonly deliveryB2c: SiteColor | null;
}

/** Tout l'état d'un site — la forme lue et écrite par l'adaptateur. */
export interface SiteState {
  readonly id: string;
  readonly place: SitePlace;
  readonly isDefault: boolean;
  readonly roles: SiteRoles;
  readonly colors: SiteColors;
  readonly archivedAt: Date | null;
}

/** Les rôles d'un site neuf : ceux de l'existant (il remet, sur place, n'expédie pas). */
const NEW_SITE_ROLES: SiteRoles = {
  pickup: true,
  pickupAudiences: { b2b: true, b2c: true },
  supply: "on_site",
  deliveryDeparture: false,
  transferMode: "integrated",
  counterSetupMinutes: 0,
};

const NO_COLORS: SiteColors = {
  pickupB2b: null,
  pickupB2c: null,
  deliveryB2b: null,
  deliveryB2c: null,
};

/**
 * @throws {SiteTransferWithoutHandoverError} servi par transfert sans remettre.
 * @throws {SiteDeliveryDepartureFromTransferError} expédie sans être sur place.
 * @throws {SiteCounterSetupError} mise en place négative ou non entière.
 * @throws {SitePickupWithoutAudienceError} un retrait ouvert à personne.
 */
function checkRoles(roles: SiteRoles): void {
  if (roles.pickup && !roles.pickupAudiences.b2b && !roles.pickupAudiences.b2c) {
    throw new SitePickupWithoutAudienceError();
  }
  if (roles.supply === "transfer" && !roles.pickup) {
    throw new SiteTransferWithoutHandoverError();
  }
  if (roles.deliveryDeparture && roles.supply !== "on_site") {
    throw new SiteDeliveryDepartureFromTransferError();
  }
  if (!Number.isInteger(roles.counterSetupMinutes) || roles.counterSetupMinutes < 0) {
    throw new SiteCounterSetupError(roles.counterSetupMinutes);
  }
}

/**
 * **Un site** — un lieu physique à nous (doc
 * `documentation/sites/sites.md`, §2).
 *
 * Il porte les règles qui peuvent refuser une écriture : la cohérence des
 * rôles, le point GPS d'un site qui expédie, et l'archivage qui
 * remplace la suppression — refusé au site par défaut et à celui qui expédie.
 *
 * Les couleurs sont **tolérées absentes** (objection B1) : les lignes
 * antérieures n'en ont pas, et `rehydrate` doit les relire.
 *
 * **Un site qui expédie, ou qui est servi par transfert, a un point GPS**
 * (Hugo, 2026-10-13 : départ des distances, destination du trajet) — tenu aux
 * TRANSITIONS ({@link assignRoles}, {@link revise}), jamais au chargement :
 * la migration S1 a posé `deliveryDeparture = true` sur le site de départ sans
 * regarder son GPS, et revalider dans `rehydrate` casserait toutes les
 * lectures de ce site, checkout compris (même raison que l'objection B1).
 * Une ligne déjà incohérente se relit donc, se renomme, change ses autres
 * rôles ; elle ne fait que refuser ce qui l'aggraverait. L'écran la signale.
 *
 * Le défaut REMET toujours : c'est le site préselectionné au checkout.
 *
 * « Un seul défaut » regarde l'ensemble des sites : le handler démet l'ancien
 * défaut ({@link relinquishDefault}) quand il en désigne un nouveau. « Au moins
 * un site » en découle : le défaut ne s'archive pas.
 *
 * ⚠️ Ne tient PAS encore « on ne retire pas `deliveryDeparture` au site de départ des
 * tournées » : le plan fait déclarer ce port par le commerce et l'implémenter
 * par la livraison, ce que la matrice interdit (`delivery → b2b`) — remonté le
 * 2026-10-13, en attente de décision.
 */
export class Site {
  private constructor(private state: SiteState) {}

  /** Un site neuf : il remet, est approvisionné sur place, n'expédie pas, sans couleur. */
  static declare(id: string, place: SitePlace, isDefault: boolean): Site {
    return new Site({
      id,
      place,
      isDefault,
      roles: NEW_SITE_ROLES,
      colors: NO_COLORS,
      archivedAt: null,
    });
  }

  /** Relit un site enregistré ; ses rôles sont revalidés. */
  static rehydrate(state: SiteState): Site {
    checkRoles(state.roles);
    return new Site(state);
  }

  get id(): string {
    return this.state.id;
  }

  get label(): string {
    return this.state.place.label;
  }

  get isDefault(): boolean {
    return this.state.isDefault;
  }

  get isArchived(): boolean {
    return this.state.archivedAt !== null;
  }

  /** L'état à écrire — lu par l'adaptateur. */
  snapshot(): SiteState {
    return this.state;
  }

  /**
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteDeliveryDepartureWithoutGpsError} le point d'un site qui expédie serait effacé.
   * @throws {SiteTransferWithoutGpsError} celui d'un site servi par transfert aussi.
   */
  revise(place: SitePlace): void {
    this.assertActive();
    if (this.state.place.gps !== null && place.gps === null) {
      this.assertGpsKept(this.state.roles, this.state.place.gps, null);
    }
    this.state = { ...this.state, place };
  }

  /**
   * @throws {ArchivedSiteError} un site archivé ne devient pas le défaut.
   * @throws {DefaultSiteMustHandOverError} le défaut est proposé au checkout.
   */
  makeDefault(): void {
    this.assertActive();
    if (!this.state.roles.pickup) {
      throw new DefaultSiteMustHandOverError(this.label);
    }
    this.state = { ...this.state, isDefault: true };
  }

  /** Cède le rang de défaut à un autre site, que le handler vient de désigner. */
  relinquishDefault(): void {
    this.state = { ...this.state, isDefault: false };
  }

  /**
   * Les rôles, et le point GPS qui se saisit avec eux (Hugo, 2026-10-13) —
   * `undefined` le laisse tel quel, `null` l'efface. `isDeparture` est un fait
   * que la livraison détient (`DepartureSiteReader`) : le handler le lit.
   *
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTransferWithoutHandoverError}
   * @throws {SiteDeliveryDepartureFromTransferError}
   * @throws {SiteCounterSetupError}
   * @throws {SitePickupWithoutAudienceError} « Retrait » coché sans aucune clientèle.
   * @throws {DefaultSiteMustHandOverError} le défaut cesserait de remettre.
   * @throws {SiteDeliveryDepartureWithoutGpsError} « Livraison » cochée sans point, ou point effacé.
   * @throws {SiteTransferWithoutGpsError} « par transfert » sans point, ou point effacé.
   * @throws {DepartureSiteMustDeliverError} « Livraison » retirée au départ des tournées.
   */
  assignRoles(roles: SiteRoles, gps?: GpsPoint | null, isDeparture = false): void {
    this.assertActive();
    checkRoles(roles);
    if (isDeparture && !roles.deliveryDeparture) {
      throw new DepartureSiteMustDeliverError(this.label);
    }
    if (this.state.isDefault && !roles.pickup) {
      throw new DefaultSiteMustHandOverError(this.label);
    }
    const before = this.state.place.gps;
    const after = gps === undefined ? before : gps;
    this.assertGpsKept(roles, before, after);
    this.state = { ...this.state, roles, place: { ...this.state.place, gps: after } };
  }

  /**
   * Les quatre couleurs, en bloc. `null` RETIRE une couleur : on peut
   * revenir à « pas de couleur » (Hugo, 2026-10-13) — les couleurs sont
   * facultatives pour de bon.
   *
   * @throws {ArchivedSiteError} le site est archivé.
   */
  paint(colors: SiteColors): void {
    this.assertActive();
    this.state = { ...this.state, colors };
  }

  /**
   * Archive le site : il n'est plus proposé, mais se résout toujours par id.
   *
   * @throws {ArchivedSiteError} il l'est déjà.
   * @throws {DefaultSiteArchiveError} c'est le site par défaut.
   * @throws {DeliveryDepartureSiteArchiveError} les livraisons en partent.
   */
  archive(at: Date): void {
    this.assertActive();
    if (this.state.isDefault) {
      throw new DefaultSiteArchiveError(this.label);
    }
    if (this.state.roles.deliveryDeparture) {
      throw new DeliveryDepartureSiteArchiveError(this.label);
    }
    this.state = { ...this.state, archivedAt: at };
  }

  /**
   * Refuse ce qui laisserait sans point un site qui en a besoin — il expédie
   * (départ des distances) ou il est servi par transfert (destination du
   * trajet), Hugo 2026-10-13 : prendre ce rôle sans point, ou effacer le
   * point d'un site qui l'a. Une ligne d'avant la règle, déjà dans ce rôle
   * sans point, n'est pas bloquée tant qu'elle n'aggrave rien.
   */
  private assertGpsKept(roles: SiteRoles, before: GpsPoint | null, after: GpsPoint | null): void {
    if (after !== null) {
      return;
    }
    const was = this.state.roles;
    const departureLost = roles.deliveryDeparture && (!was.deliveryDeparture || before !== null);
    if (departureLost) {
      throw new SiteDeliveryDepartureWithoutGpsError(this.label);
    }
    const transfer = roles.supply === "transfer";
    if (transfer && (was.supply !== "transfer" || before !== null)) {
      throw new SiteTransferWithoutGpsError(this.label);
    }
  }

  private assertActive(): void {
    if (this.isArchived) {
      throw new ArchivedSiteError(this.label);
    }
  }
}
