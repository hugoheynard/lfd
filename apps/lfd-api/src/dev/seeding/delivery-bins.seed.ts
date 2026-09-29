import type { BinTypePayload } from "@lfd/contracts";

import { AddBinTypeCommand } from "../../delivery/application/commands/add-bin-type.command.js";
import { ReactivateBinTypeCommand } from "../../delivery/application/commands/reactivate-bin-type.command.js";
import { SetBinCapacityCommand } from "../../delivery/application/commands/set-bin-capacity.command.js";
import { asStaff } from "./order-placing.seed.js";
import type { RoundsContext, SeedBins } from "./delivery-rounds.seed.js";

/**
 * **Le catalogue des bacs et quelques contenances** (lot 4 bis, tranche B —
 * Hugo : « tout part en bac »), par les vrais handlers de `delivery` : un type
 * entre par `AddBinTypeCommand`, donc par l'invariant « l'intérieur tient dans
 * l'extérieur » et l'unicité du nom.
 *
 * Trois types : un petit isotherme, et deux cloisonnables — de quoi montrer
 * un bac entier, un demi-bac, un bac partagé et le froid.
 */

export const BIN_S = "Bac S isotherme";
export const BIN_M = "Bac M";
export const BIN_L = "Bac L";

const BIN_TYPES: readonly BinTypePayload[] = [
  {
    name: BIN_S,
    outer: { lengthCm: 40, widthCm: 30, heightCm: 20 },
    inner: { lengthCm: 36, widthCm: 26, heightCm: 16 },
    isotherm: true,
    maxStack: 6,
    divisible: false,
  },
  {
    name: BIN_M,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
    isotherm: false,
    maxStack: 7,
    divisible: true,
  },
  {
    name: BIN_L,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 32 },
    inner: { lengthCm: 57, widthCm: 37, heightCm: 30 },
    isotherm: false,
    maxStack: 5,
    divisible: true,
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
