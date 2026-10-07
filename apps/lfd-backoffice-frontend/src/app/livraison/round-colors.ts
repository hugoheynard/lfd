/**
 * Les couleurs des tournées sur la carte et dans les colonnes, sorties de
 * `delivery-planning.ts` : elles ne dépendent que d'un rang, et la composition
 * comme l'aperçu les partagent.
 */

/**
 * La roue des teintes partagée ÉGALEMENT entre les véhicules du jour (Hugo,
 * 2026-09-29 : « des circuits très contrastés »). Deux tokens fold voisins
 * (primaire et info) sortaient en deux bleus que la carte ne séparait pas.
 *
 * En OKLCH, luminosité et saturation fixes : seules les teintes changent, donc
 * aucune tournée ne paraît plus importante qu'une autre, et l'écart perçu
 * entre deux teintes est le même partout sur la roue — ce que HSL ne tient pas.
 * Une luminosité moyenne se lit sur le fond clair comme sur le sombre.
 */
const ROUND_LIGHTNESS = 0.63;
const ROUND_CHROMA = 0.17;
/** Départ de la roue : un orangé, loin du rouge réservé au « hors créneau ». */
const ROUND_FIRST_HUE = 45;
const FULL_TURN = 360;

/** La couleur d'un rang parmi `count` véhicules : une couleur CSS complète. */
export function roundColor(rank: number, count: number): string {
  const hue = (ROUND_FIRST_HUE + (rank * FULL_TURN) / Math.max(count, 1)) % FULL_TURN;
  return `oklch(${String(ROUND_LIGHTNESS)} ${String(ROUND_CHROMA)} ${hue.toFixed(1)})`;
}

/**
 * La couleur de chaque véhicule : son rang dans `vehicleIds` (sans doublon),
 * sur la roue de {@link roundColor}. Le même véhicule garde sa couleur tant
 * que la liste ne change pas — d'un onglet à l'autre, de la composition à
 * l'aperçu.
 */
export function vehicleColors(vehicleIds: readonly string[]): ReadonlyMap<string, string> {
  const unique = [...new Set(vehicleIds)];
  return new Map(unique.map((id, rank) => [id, roundColor(rank, unique.length)]));
}
