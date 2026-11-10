/**
 * **La période imprimée sur le récapitulatif** (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §9, lot R3) —
 * les bornes du filtre de jour que l'écran affichait quand la sélection a été
 * faite. Purement INFORMATIVE : elle n'élargit ni ne restreint la sélection,
 * les ids font foi.
 */
export interface OrderSummaryPeriod {
  /** `AAAA-MM-JJ`, déjà vérifié au calendrier ; `null` : pas de borne. */
  readonly from: string | null;
  readonly to: string | null;
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

interface DayParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

function partsOf(isoDay: string): DayParts {
  const [year = "", month = "", day = ""] = isoDay.split("-");
  const dayNumber = Number(day);
  return {
    day: dayNumber === 1 ? "1er" : String(dayNumber),
    month: MONTHS[Number(month) - 1] ?? month,
    year,
  };
}

/** `2026-10-01` → « 1er octobre 2026 ». */
export function frenchDay(isoDay: string): string {
  const parts = partsOf(isoDay);
  return `${parts.day} ${parts.month} ${parts.year}`;
}

/** « du 1er au 15 octobre 2026 », le mois et l'année dits une fois s'ils sont communs. */
function between(from: string, to: string): string {
  const start = partsOf(from);
  const end = partsOf(to);
  if (start.year !== end.year) {
    return `du ${frenchDay(from)} au ${frenchDay(to)}`;
  }
  const head = start.month === end.month ? start.day : `${start.day} ${start.month}`;
  return `du ${head} au ${frenchDay(to)}`;
}

/**
 * « Retraits et livraisons du 1er au 15 octobre 2026 » — ou « le … », « à
 * partir du … », « jusqu'au … » ; `null` sans aucune borne.
 */
export function periodSentence(period: OrderSummaryPeriod | null): string | null {
  const from = period?.from ?? null;
  const to = period?.to ?? null;
  const lead = "Retraits et livraisons";
  if (from !== null && to !== null) {
    return from === to ? `${lead} le ${frenchDay(from)}` : `${lead} ${between(from, to)}`;
  }
  if (from !== null) {
    return `${lead} à partir du ${frenchDay(from)}`;
  }
  if (to !== null) {
    return `${lead} jusqu'au ${frenchDay(to)}`;
  }
  return null;
}
