import type { JournalFactType } from "@lfd/contracts/journal-facts";

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
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "pickup_address";

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
  ) {}

  journalFact(): JournalFact {
    return {
      type: SITE_FACTS.rolesSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.siteId,
      payload: {
        subjectLabel: this.label,
        handsOver: this.roles.handsOver,
        supply: this.roles.supply,
        dispatches: this.roles.dispatches,
        transferMode: this.roles.transferMode,
        counterSetupMinutes: this.roles.counterSetupMinutes,
      },
    };
  }
}

/** Les couleurs du site ont été enregistrées. */
export class SiteColorsSetEvent implements JournaledEvent {
  constructor(
    readonly siteId: string,
    readonly label: string,
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
      },
    };
  }
}
