import type { OrderCutoffSettingsView } from "@lfd/contracts";

/**
 * **Par quelle porte une commande vise aujourd'hui** (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`
 * bloquant 3, lot L4) :
 *
 * - `public_online` : un particulier, en ligne (sans société) ;
 * - `pro_online` : un pro, en ligne, pour sa société ;
 * - `counter` : l'équipe, qui saisit pour un pro (le comptoir, le Commercial).
 */
export type SameDayDoor = "public_online" | "pro_online" | "counter";

/** Les réglages du circuit que la règle lit — la vue du réglage singleton. */
export type SameDayDoorSettings = Pick<
  OrderCutoffSettingsView,
  "sameDayPublicAllowed" | "sameDayProAllowed" | "sameDayProOnline"
>;

/**
 * La porte d'une commande : l'équipe d'abord (elle saisit toujours pour une
 * société), puis la présence d'une société.
 */
export function sameDayDoorOf(companyId: string | null, byStaff: boolean): SameDayDoor {
  if (byStaff) {
    return "counter";
  }
  return companyId === null ? "public_online" : "pro_online";
}

/**
 * **Aujourd'hui est-il ouvert à cette porte ?** — LA règle du réglage, depuis
 * le lot L4 (Hugo, 2026-11-02 : « les nouveaux réglages font foi »). Un pro
 * en ligne demande les deux réglages : « pros » et « en ligne » ; sans le
 * second, les pros commandent pour aujourd'hui au comptoir seulement.
 *
 * `same_day_allowed`, l'ancien interrupteur unique, n'est plus lu : colonne
 * morte, gardée en base (CLAUDE.md §0).
 */
export function sameDayOpenTo(settings: SameDayDoorSettings, door: SameDayDoor): boolean {
  switch (door) {
    case "public_online":
      return settings.sameDayPublicAllowed;
    case "pro_online":
      return settings.sameDayProAllowed && settings.sameDayProOnline;
    case "counter":
      return settings.sameDayProAllowed;
  }
}
