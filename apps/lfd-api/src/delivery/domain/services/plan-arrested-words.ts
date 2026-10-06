import type { CompositionGap } from "./composition-prerequisites.js";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
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
];

/**
 * « mercredi 7 octobre », « dimanche 1er février » — la journée dite comme
 * l'équipe la dit. Le fournil a la sienne (`frenchDayLabel`), hors de portée :
 * la livraison ne lit la production que par son canal.
 */
export function deliveryDayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)).getUTCDay();
  const dayOfMonth = date === 1 ? "1er" : String(date ?? "");
  return `${WEEKDAYS[weekday] ?? ""} ${dayOfMonth} ${MONTHS[(month ?? 1) - 1] ?? ""}`.trim();
}

/** Ce que dit la cloche du plan arrêté — un sujet et une ligne. */
export interface PlanArrestedWords {
  readonly subject: string;
  readonly body: string;
}

/** Ce qui manque au socle, et où le régler — les mots des refus de « Proposer ». */
const GAP_WORDS: Readonly<Record<CompositionGap, string>> = {
  no_measured_vehicle:
    "aucun véhicule en service n'a ses cotes. Renseignez-les dans Livraison → Véhicules",
  no_active_bin_type: "aucun type de bac n'est en service. Ajoutez-en un dans Livraison → Bacs",
};

function deliveries(count: number): string {
  return count > 1 ? `${String(count)} livraisons` : `${String(count)} livraison`;
}

/**
 * **La cloche du plan arrêté** (plan de composition automatique, §16.5) : elle
 * ne sonne que si l'ensemble a GRANDI, et dit de combien. La première fois,
 * c'est l'arrêt (tout l'ensemble est annoncé : `added === total`) ; ensuite,
 * un retirage ou une réannonce complète le plan de livraisons à placer.
 *
 * Sans socle de composition (CA-D3), elle le dit : proposer refuserait.
 */
export function planArrestedWords(input: {
  readonly serviceDay: string;
  readonly added: number;
  readonly total: number;
  readonly gap: CompositionGap | null;
}): PlanArrestedWords {
  const label = deliveryDayLabel(input.serviceDay);
  const first = input.added === input.total;
  const subject = first
    ? `Le plan du ${label} est arrêté : ${deliveries(input.total)} à mettre en tournées`
    : `Le plan du ${label} est complété : ${input.added > 1 ? `${String(input.added)} nouvelles livraisons` : "1 nouvelle livraison"} à placer`;
  const body =
    input.gap === null
      ? "Ouvrez Organisation de tournées et lancez « Proposer les tournées » ; rien n'est appliqué sans vous."
      : `Impossible de proposer les tournées : ${GAP_WORDS[input.gap]}, puis ouvrez Organisation de tournées.`;
  return { subject, body };
}
