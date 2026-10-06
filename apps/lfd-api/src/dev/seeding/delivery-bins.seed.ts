import type { BinTypePayload, OpenPackingContainer } from "@lfd/contracts";

import { AddBinTypeCommand } from "../../delivery/application/commands/add-bin-type.command.js";
import { ReactivateBinTypeCommand } from "../../delivery/application/commands/reactivate-bin-type.command.js";
import { SetBinCapacityCommand } from "../../delivery/application/commands/set-bin-capacity.command.js";
import { asStaff } from "./order-placing.seed.js";
import { binContainers, type RoundsContext, type SeedBins } from "./delivery-rounds.seed.js";

/**
 * **Le catalogue des bacs et quelques contenances** (lot 4 bis, tranche B —
 * Hugo : « tout part en bac »), par les vrais handlers de `delivery` : un type
 * entre par `AddBinTypeCommand`, donc par l'invariant « l'intérieur tient dans
 * l'extérieur » et l'unicité du nom.
 *
 * Trois types : un petit isotherme, et deux cloisonnables — de quoi montrer
 * un bac entier, un demi-bac, un bac partagé et le froid. Et la manne à pain,
 * le contenant par défaut d'une commande (`delivery-settings.seed.ts`).
 */

export const BIN_S = "Bac S isotherme";
export const BIN_M = "Bac M";
export const BIN_L = "Bac L";
/**
 * La manne à pain (2026-10-06) : le contenant que le calcul des tournées
 * compte par défaut pour une commande dont il ne sait rien. Haute, pilée
 * par deux au plus (Hugo, 2026-10-06 : « on peut stacker 2 mannes »), non
 * divisible — c'est elle qui fait la place au sol.
 */
export const BIN_MANNE = "Manne à pain";
/** Combien de ficelles une manne prend : les hôtels des tournées de demain en commandent par mannes. */
export const FICELLES_PER_MANNE = 80;
/** Le SKU que seule la manne sait contenir — la ficelle artisane. */
export const MANNE_SKU = "PAI-010";

const BIN_TYPES: readonly BinTypePayload[] = [
  {
    name: BIN_S,
    outer: { lengthMm: 400, widthMm: 300, heightMm: 200 },
    inner: { lengthMm: 360, widthMm: 260, heightMm: 160 },
    isotherm: true,
    maxStack: 6,
    divisible: false,
  },
  {
    name: BIN_M,
    outer: { lengthMm: 600, widthMm: 400, heightMm: 220 },
    inner: { lengthMm: 570, widthMm: 370, heightMm: 200 },
    isotherm: false,
    maxStack: 7,
    divisible: true,
  },
  {
    name: BIN_L,
    outer: { lengthMm: 600, widthMm: 400, heightMm: 320 },
    inner: { lengthMm: 570, widthMm: 370, heightMm: 300 },
    isotherm: false,
    maxStack: 5,
    divisible: true,
  },
  {
    name: BIN_MANNE,
    outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
    inner: { lengthMm: 625, widthMm: 420, heightMm: 690 },
    isotherm: false,
    maxStack: 2,
    divisible: false,
  },
];

/** Combien d'unités un bac ENTIER contient, par type et par SKU. */
const CAPACITIES: readonly {
  readonly bin: string;
  readonly sku: string;
  readonly units: number;
}[] = [
  { bin: BIN_M, sku: "PAI-001", units: 25 },
  { bin: BIN_L, sku: "PAI-001", units: 40 },
  { bin: BIN_M, sku: "PAI-013", units: 12 },
  { bin: BIN_L, sku: "PAI-013", units: 18 },
  { bin: BIN_S, sku: "VIE-001", units: 20 },
  { bin: BIN_M, sku: "VIE-001", units: 40 },
  { bin: BIN_L, sku: "VIE-001", units: 60 },
  { bin: BIN_M, sku: "VIE-002", units: 40 },
  { bin: BIN_L, sku: "VIE-002", units: 60 },
  // La ficelle n'a de contenance qu'en manne : la commande qui n'en porte que
  // s'estime en mannes, et rien d'autre ne change d'estimation.
  { bin: BIN_MANNE, sku: MANNE_SKU, units: FICELLES_PER_MANNE },
];

/**
 * **Les types de bacs, idempotents par nom.** Un type absent est ajouté, un
 * type archivé sur le poste est remis en service, les autres sont laissés tels
 * quels — et aucun autre type n'est touché. Puis les contenances : poser une
 * case inchangée n'écrit rien.
 *
 * @returns l'identifiant de chaque type, par nom.
 */
export async function seedBinTypes(context: RoundsContext): Promise<ReadonlyMap<string, string>> {
  const ids = new Map<string, string>();
  for (const binType of BIN_TYPES) {
    ids.set(binType.name, await ensureBinType(context, binType));
  }
  for (const capacity of CAPACITIES) {
    const binTypeId = ids.get(capacity.bin);
    if (binTypeId !== undefined) {
      await asStaff(context.now, () =>
        context.commands.execute(
          new SetBinCapacityCommand({ binTypeId, sku: capacity.sku, units: capacity.units }),
        ),
      );
    }
  }
  return ids;
}

async function ensureBinType(context: RoundsContext, binType: BinTypePayload): Promise<string> {
  const existing = await context.prisma.deliveryBinType.findFirst({
    where: { name: binType.name },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true, archivedAt: true },
  });
  if (existing === null) {
    return asStaff(context.now, () =>
      context.commands.execute<AddBinTypeCommand, string>(new AddBinTypeCommand(binType)),
    );
  }
  if (existing.archivedAt !== null) {
    await asStaff(context.now, () =>
      context.commands.execute(new ReactivateBinTypeCommand(existing.id)),
    );
  }
  return existing.id;
}

/** Des bacs d'un type désigné par son NOM — ce qu'écrit la journée semée. */
export interface DayBins {
  readonly type: string;
  readonly whole: number;
  readonly half: boolean;
  readonly innerBags: number;
}

/** Un Bac M entier, deux sacs dedans — ce que fait la plupart des commandes. */
export const DEFAULT_BINS: readonly DayBins[] = [
  { type: BIN_M, whole: 1, half: false, innerBags: 2 },
];

/** Les noms de types remplacés par leurs identifiants semés. */
export function resolveBins(
  binTypes: ReadonlyMap<string, string>,
  bins: readonly DayBins[],
): readonly SeedBins[] {
  return bins.map(({ type, ...rest }) => {
    const binTypeId = binTypes.get(type);
    if (binTypeId === undefined) {
      throw new Error(`Type de bac « ${type} » absent du catalogue semé.`);
    }
    return { binTypeId, ...rest };
  });
}

/** La Folie Douce commande large : huit Bacs L, ouverts au colisage du comptoir. */
const COUNTER_DELIVERY_BINS: readonly DayBins[] = [
  { type: BIN_L, whole: 8, half: false, innerBags: 3 },
];

/** Les contenants de la livraison du comptoir — colisée avec la file du comptoir (K3c). */
export function counterDeliveryContainers(
  binTypes: ReadonlyMap<string, string>,
): readonly OpenPackingContainer[] {
  return binContainers(resolveBins(binTypes, COUNTER_DELIVERY_BINS), null);
}
