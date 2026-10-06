import { FICELLES_PER_MANNE, MANNE_SKU } from "./delivery-bins.seed.js";
import {
  isoDay,
  place,
  type SeedContext,
  type SeedLine,
  shiftDays,
  type Target,
} from "./order-placing.seed.js";
import { TOMORROW_ROUNDS_CLIENTS } from "./tomorrow-rounds-clients.seed.js";
import { estimatedMannes } from "./tomorrow-rounds-houses.js";

/**
 * **Les livraisons de demain, pour « Proposer »** (Hugo, 2026-10-06 : « un bel
 * exemple de tournées qui nécessiteraient 3 camionnettes »).
 *
 * Une commande par maison de `TOMORROW_ROUNDS_CLIENTS`, à l'échéance de son
 * carnet, posée aujourd'hui pour demain par le vrai handler — le plan de
 * demain reste ouvert, comme le reste de la journée (`placeTomorrow`).
 *
 * ## Pourquoi trois camionnettes, et pas deux
 *
 * Par la place au sol, et par la hauteur. Une manne (665 × 460 × 715 mm) se
 * pile par deux (Hugo, 2026-10-06 : « on peut stacker 2 mannes »), mais deux
 * mannes font 1430 mm : seule la caisse de 145 cm les empile. La Camionnette 1
 * en porte donc dix-huit, les Camionnettes 2 (140 cm) et 3 (130 cm) neuf
 * chacune, une par place au sol (`planLoading`, plafond compris, mesuré le
 * 2026-10-06 sur les trois). Les quatorze maisons ordinaires prennent une
 * manne chacune — le contenant par défaut, faute de contenance pour leur
 * pain ; l'Hôtel Le Grand Névé et les trois grands hôtels en prennent trois,
 * les trois résidences deux, estimées par la contenance de la ficelle. Avec
 * la livraison de l'Hôtel Le Lac Blanc déjà posée pour demain (une manne par
 * défaut et un Bac M estimé), cela fait trente-trois mannes : plus que les
 * vingt-sept places des deux meilleures camionnettes, moins que les
 * trente-six de trois. Le second passage étant coupé dans les réglages
 * (`delivery-settings.seed.ts`), deux camionnettes ne peuvent pas compenser
 * par un aller-retour.
 *
 * ⚠️ Les maisons ordinaires ne commandent QUE des références sans contenance
 * (baguette artisane, pain de campagne) : une seule ligne estimable ferait
 * « part estimée + défaut » et changerait le compte.
 */

/** Les lignes d'une maison ordinaire : du pain, sans contenance réglée. */
function ordinaryLines(rank: number): readonly SeedLine[] {
  return [
    // Déterministe, et varié d'une maison à l'autre.
    { sku: "PAI-002", quantity: 12 + ((rank * 7) % 19) },
    { sku: "PAI-008", quantity: 3 + (rank % 5) },
  ];
}

export { HOTEL_MANNES } from "./tomorrow-rounds-houses.js";

/** Une maison à mannes : des ficelles, et seulement elles — des mannes pleines. */
function manneLines(mannes: number): readonly SeedLine[] {
  return [{ sku: MANNE_SKU, quantity: mannes * FICELLES_PER_MANNE }];
}

function linesOf(enseigne: string, rank: number): readonly SeedLine[] {
  const mannes = estimatedMannes(enseigne);
  return mannes === null ? ordinaryLines(rank) : manneLines(mannes);
}

/** Les SKU que la journée de demain commande : le semis vérifie qu'ils existent. */
export const TOMORROW_ROUNDS_SKUS: readonly string[] = ["PAI-002", "PAI-008", MANNE_SKU];

/**
 * Pose les livraisons de demain, une par maison, AUJOURD'HUI à l'heure de
 * commande — avant la limite de la veille, comme `placeTomorrow`.
 *
 * @param targets les maisons résolues, par enseigne.
 * @returns le nombre de commandes posées.
 */
export async function placeTomorrowRounds(
  context: SeedContext,
  targets: ReadonlyMap<string, Target>,
  today: Date,
): Promise<number> {
  let placed = 0;
  for (const [rank, client] of TOMORROW_ROUNDS_CLIENTS.entries()) {
    const target = targets.get(client.enseigne);
    if (target === undefined) {
      throw new Error(`Maison « ${client.enseigne} » absente du semis des tournées de demain.`);
    }
    await place(context, target, {
      at: today,
      forDay: isoDay(shiftDays(today, 1)),
      method: "delivery",
      point: null,
      // L'échéance du carnet : la commande n'en demande pas d'autre.
      window: null,
      lines: linesOf(client.enseigne, rank),
      paid: false,
    });
    placed += 1;
  }
  return placed;
}
