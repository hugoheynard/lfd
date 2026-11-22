import type { StaffNoticeAudiencesView } from "@lfd/contracts";

import type { NoticeTargets, StaffNoticeAudience } from "./staff-notice-audience.js";

/** Qui règle, et quand — posé sur chaque ligne ajoutée. */
export interface NoticeAudienceStamp {
  readonly by: string;
  readonly at: Date;
}

/** Port d'ÉCRITURE du réglage : l'agrégat entier, relu et rendu. */
export abstract class StaffNoticeAudienceRepository {
  /** Le réglage d'un avis ; vide s'il n'en a pas. */
  abstract load(template: string): Promise<StaffNoticeAudience>;
  /** Écrit l'écart : les lignes ajoutées portent `stamp`, les retirées s'effacent. */
  abstract save(audience: StaffNoticeAudience, stamp: NoticeAudienceStamp): Promise<void>;
}

/** Les rôles et les membres que cite un réglage, tels que l'annuaire les connaît. */
export abstract class StaffNoticeTargetsReader {
  abstract targetsOf(
    roleKeys: readonly string[],
    staffUserIds: readonly string[],
  ): Promise<NoticeTargets>;
}

/** Port de LECTURE de l'écran : chaque avis réglable et les candidats. */
export abstract class StaffNoticeAudienceReader {
  abstract all(): Promise<StaffNoticeAudiencesView>;
}
