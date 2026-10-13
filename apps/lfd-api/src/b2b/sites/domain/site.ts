import type { GpsPoint, PickupOpening } from "@lfd/contracts";

import type { PickupDiscount } from "../../pickup-addresses/domain/pickup-discount.js";
import type { SiteColor } from "./site-color.js";
import {
  ArchivedSiteError,
  DefaultSiteArchiveError,
  DefaultSiteMustHandOverError,
  DispatchingSiteArchiveError,
  SiteColorErasedError,
  SiteCounterSetupError,
  SiteDispatchesFromTransferError,
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

/** Les rôles d'un site et leurs réglages (plan, §3.1 et §4.6). */
export interface SiteRoles {
  readonly handsOver: boolean;
  readonly supply: SiteSupply;
  readonly dispatches: boolean;
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
  handsOver: true,
  supply: "on_site",
  dispatches: false,
  transferMode: "integrated",
  counterSetupMinutes: 0,
};

const NO_COLORS: SiteColors = {
  pickupB2b: null,
  pickupB2c: null,
  deliveryB2b: null,
  deliveryB2c: null,
};

/** Le nom de chaque couleur, tel que l'écran le montre. */
const COLOR_LABELS: readonly (readonly [keyof SiteColors, string])[] = [
  ["pickupB2b", "retrait pro"],
  ["pickupB2c", "retrait particulier"],
  ["deliveryB2b", "livraison pro"],
  ["deliveryB2c", "livraison particulier"],
];

/**
 * @throws {SiteTransferWithoutHandoverError} servi par transfert sans remettre.
 * @throws {SiteDispatchesFromTransferError} expédie sans être sur place.
 * @throws {SiteCounterSetupError} mise en place négative ou non entière.
 */
function checkRoles(roles: SiteRoles): void {
  if (roles.supply === "transfer" && !roles.handsOver) {
    throw new SiteTransferWithoutHandoverError();
  }
  if (roles.dispatches && roles.supply !== "on_site") {
    throw new SiteDispatchesFromTransferError();
  }
  if (!Number.isInteger(roles.counterSetupMinutes) || roles.counterSetupMinutes < 0) {
    throw new SiteCounterSetupError(roles.counterSetupMinutes);
  }
}

/**
 * **Un site** — un lieu physique à nous (plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`, §3).
 *
 * Il porte les règles qui peuvent refuser une écriture : la cohérence des
 * rôles, les couleurs qu'on change sans jamais les effacer, et l'archivage qui
 * remplace la suppression — refusé au site par défaut et à celui qui expédie.
 *
 * Les couleurs sont **tolérées absentes** (objection B1) : les lignes
 * antérieures n'en ont pas, et `rehydrate` doit les relire.
 *
 * Le défaut REMET toujours : c'est le site préselectionné au checkout.
 *
 * « Un seul défaut » regarde l'ensemble des sites : le handler démet l'ancien
 * défaut ({@link relinquishDefault}) quand il en désigne un nouveau. « Au moins
 * un site » en découle : le défaut ne s'archive pas.
 *
 * ⚠️ Ne tient PAS encore « on ne retire pas `dispatches` au site de départ des
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

  /** @throws {ArchivedSiteError} le site est archivé. */
  revise(place: SitePlace): void {
    this.assertActive();
    this.state = { ...this.state, place };
  }

  /**
   * @throws {ArchivedSiteError} un site archivé ne devient pas le défaut.
   * @throws {DefaultSiteMustHandOverError} le défaut est proposé au checkout.
   */
  makeDefault(): void {
    this.assertActive();
    if (!this.state.roles.handsOver) {
      throw new DefaultSiteMustHandOverError(this.label);
    }
    this.state = { ...this.state, isDefault: true };
  }

  /** Cède le rang de défaut à un autre site, que le handler vient de désigner. */
  relinquishDefault(): void {
    this.state = { ...this.state, isDefault: false };
  }

  /**
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTransferWithoutHandoverError}
   * @throws {SiteDispatchesFromTransferError}
   * @throws {SiteCounterSetupError}
   * @throws {DefaultSiteMustHandOverError} le défaut cesserait de remettre.
   */
  assignRoles(roles: SiteRoles): void {
    this.assertActive();
    checkRoles(roles);
    if (this.state.isDefault && !roles.handsOver) {
      throw new DefaultSiteMustHandOverError(this.label);
    }
    this.state = { ...this.state, roles };
  }

  /**
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteColorErasedError} une couleur posée reviendrait à `null`.
   */
  paint(colors: SiteColors): void {
    this.assertActive();
    const current = this.state.colors;
    for (const [key, label] of COLOR_LABELS) {
      if (current[key] !== null && colors[key] === null) {
        throw new SiteColorErasedError(label);
      }
    }
    this.state = { ...this.state, colors };
  }

  /**
   * Archive le site : il n'est plus proposé, mais se résout toujours par id.
   *
   * @throws {ArchivedSiteError} il l'est déjà.
   * @throws {DefaultSiteArchiveError} c'est le site par défaut.
   * @throws {DispatchingSiteArchiveError} les livraisons en partent.
   */
  archive(at: Date): void {
    this.assertActive();
    if (this.state.isDefault) {
      throw new DefaultSiteArchiveError(this.label);
    }
    if (this.state.roles.dispatches) {
      throw new DispatchingSiteArchiveError(this.label);
    }
    this.state = { ...this.state, archivedAt: at };
  }

  private assertActive(): void {
    if (this.isArchived) {
      throw new ArchivedSiteError(this.label);
    }
  }
}
