/**
 * **« Proposer », bac par bac** (suite de K2b,
 * `documentation/colisage/colisage.md` §7) — PUR : ni
 * horloge, ni base, ni aléa. Mêmes entrées, mêmes bacs, même contenu.
 *
 * La livraison propose un contenu PAR TYPE × N bacs (`whole` entiers, plus une
 * moitié). Le colisage le coupe en bacs physiques, un contenant par bac :
 *
 * 1. les bacs d'une entrée sont, dans l'ordre, ses `whole` bacs entiers puis
 *    sa moitié ; les entrées gardent l'ordre de la proposition (froid d'abord) ;
 * 2. chaque bac se remplit AVANT le suivant, article par article dans l'ordre
 *    des SKU : une unité occupe `1 / contenance(type, SKU)` d'un bac entier,
 *    une moitié offre 0,5 — la règle de place de la livraison ;
 * 3. on ne place que ce qui est DISPONIBLE (`available` : ce qui reste de la
 *    ligne, borné par la réserve) ; ce qui ne rentre pas, ou n'est pas encore
 *    sorti du four, reste « à répartir ».
 *
 * Un bac proposé reste un bac, même vide : la proposition dit combien de bacs
 * la commande demande, et la marchandise qui sortira du four ira dedans.
 */

/** Ce qu'offre une moitié de bac cloisonné — la règle de place de la livraison. */
const HALF_BIN = 0.5;

/** Tolérance des sommes de fractions (1/3 + 1/3 + 1/3 doit tenir dans 1). */
const EPSILON = 1e-9;

/** Une quantité d'un article. */
export interface ProposedPieces {
  readonly sku: string;
  readonly quantity: number;
}

/** Une entrée de la proposition : des bacs d'UN type et leur contenu total. */
export interface ProposalEntry {
  readonly binTypeId: string;
  readonly whole: number;
  readonly half: boolean;
  readonly content: readonly ProposedPieces[];
}

/** Un bac physique à déclarer : son type, entier ou moitié, et ce qu'il recevra. */
export interface ProposedBin {
  readonly binTypeId: string;
  readonly half: boolean;
  readonly lines: readonly ProposedPieces[];
}

/** Les unités d'un bac ENTIER de ce type pour cet article, ou `null`. */
export type UnitsOf = (binTypeId: string, sku: string) => number | null;

/**
 * Les bacs de la proposition, remplis l'un après l'autre.
 *
 * @param available par SKU, ce qui peut encore être placé ; absent = rien.
 */
export function distributeProposal(
  entries: readonly ProposalEntry[],
  unitsOf: UnitsOf,
  available: ReadonlyMap<string, number>,
): readonly ProposedBin[] {
  const left = new Map(available);
  return entries.flatMap((entry) => {
    const due = new Map(
      [...entry.content]
        .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
        .map((item) => [item.sku, Math.min(item.quantity, left.get(item.sku) ?? 0)]),
    );
    return slotsOf(entry).map((half) => {
      const lines = fill(entry.binTypeId, half ? HALF_BIN : 1, due, unitsOf);
      for (const line of lines) {
        left.set(line.sku, (left.get(line.sku) ?? 0) - line.quantity);
      }
      return { binTypeId: entry.binTypeId, half, lines };
    });
  });
}

/** Les bacs d'une entrée : `true` pour la moitié, en dernier. */
function slotsOf(entry: ProposalEntry): readonly boolean[] {
  const whole = Array.from({ length: Math.max(0, entry.whole) }, () => false);
  return entry.half ? [...whole, true] : whole;
}

/** Remplit UN bac de ce qui reste dû à l'entrée ; mute `due`. */
function fill(
  binTypeId: string,
  room: number,
  due: Map<string, number>,
  unitsOf: UnitsOf,
): readonly ProposedPieces[] {
  let free = room;
  const lines: ProposedPieces[] = [];
  for (const [sku, quantity] of due) {
    const units = unitsOf(binTypeId, sku);
    if (units === null || units <= 0 || quantity <= 0) {
      continue;
    }
    const fits = Math.floor(free * units + EPSILON);
    const pieces = Math.min(quantity, fits);
    if (pieces > 0) {
      lines.push({ sku, quantity: pieces });
      due.set(sku, quantity - pieces);
      free -= pieces / units;
    }
  }
  return lines;
}
