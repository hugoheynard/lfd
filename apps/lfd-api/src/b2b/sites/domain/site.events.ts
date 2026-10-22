import type { JournalFactType } from "@lfd/contracts/journal-facts";
import type { GpsPoint } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { SiteColors, SiteRoles } from "./site.js";

/**
 * **Les faits propres au site** (lot S1, 2026-10-13).
 *
 * Ils gardent le préfixe et le sujet `pickup_address` : la ligne est la même,
 * son identifiant aussi, et le journal comme ses liens la retrouvent sous ce
 * nom depuis août. Un site est un point de retrait élargi, pas un autre sujet.
 */
export const SITE_FACTS = {
  archived: "pickup_address.archived",
  rolesSet: "pickup_address.roles_set",
  colorsSet: "pickup_address.colors_set",
  tablesSet: "pickup_address.tables_set",
  tableQrGenerated: "pickup_address.table_qr_generated",
  tableQrRemoved: "pickup_address.table_qr_removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

export const SUBJECT_TYPE = "pickup_address";

/** Le site a été archivé : plus proposé, toujours résolu par id. */
export class SiteArchivedEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.archived,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: { subjectLabel: this.label },
    };
  }
}

/**
 * Les rôles du site ont été enregistrés. Chacun change ce que fait la
 * logistique — remettre, être servi par transfert, expédier — et un rôle
 * coché par erreur se découvre le lendemain, au départ des tournées.
 */
export class SiteRolesSetEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
    readonly roles: SiteRoles,
    /** Le point GPS, saisi avec les rôles depuis le 2026-10-13. */
    readonly gps: GpsPoint | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.rolesSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: {
        subjectLabel: this.label,
        pickup: this.roles.pickup,
        pickupForB2b: this.roles.pickupAudiences.b2b,
        pickupForB2c: this.roles.pickupAudiences.b2c,
        supply: this.roles.supply,
        deliveryDeparture: this.roles.deliveryDeparture,
        transferMode: this.roles.transferMode,
        counterSetupMinutes: this.roles.counterSetupMinutes,
        eatIn: this.roles.eatIn,
        gps: this.gps,
      },
    };
  }
}

/** Les couleurs du site ont été enregistrées. */
export class SiteColorsSetEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
    /** Les couleurs d'avant : ce qui a été RETIRÉ se lit dans le journal. */
    readonly before: SiteColors,
    readonly colors: SiteColors,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.colorsSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: {
        subjectLabel: this.label,
        pickupColorB2b: this.colors.pickupB2b?.hex ?? null,
        pickupColorB2c: this.colors.pickupB2c?.hex ?? null,
        deliveryColorB2b: this.colors.deliveryB2b?.hex ?? null,
        deliveryColorB2c: this.colors.deliveryB2c?.hex ?? null,
        resupplyColor: this.colors.resupply?.hex ?? null,
        removed: removedColors(this.before, this.colors),
      },
    };
  }
}

/** Le nom de chaque couleur dans la charge du fait. */
const COLOR_FIELDS: readonly (readonly [keyof SiteColors, string])[] = [
  ["pickupB2b", "pickupColorB2b"],
  ["pickupB2c", "pickupColorB2c"],
  ["deliveryB2b", "deliveryColorB2b"],
  ["deliveryB2c", "deliveryColorB2c"],
  ["resupply", "resupplyColor"],
];

/** Les couleurs posées avant et vides après — « retirées » (Hugo, 2026-10-13). */
function removedColors(before: SiteColors, after: SiteColors): readonly string[] {
  return COLOR_FIELDS.filter(([key]) => before[key] !== null && after[key] === null).map(
    ([, field]) => field,
  );
}
