import { type VehiclePayload, vehicleEnergySchema } from "@lfd/contracts";

import { AddVehicleCommand } from "../../delivery/application/commands/add-vehicle.command.js";
import { CorrectVehicleCommand } from "../../delivery/application/commands/correct-vehicle.command.js";
import { ReactivateVehicleCommand } from "../../delivery/application/commands/reactivate-vehicle.command.js";
import type { RoundsContext } from "./delivery-rounds.seed.js";
import { asStaff } from "./order-placing.seed.js";

/**
 * **La flotte semée**, par les vrais handlers de `delivery` : ajout, remise
 * en service, correction — jamais une ligne posée en Prisma.
 */

/**
 * Les trois camionnettes. Plaques au format SIV, que le value object accepte
 * (ni I, ni O, ni U) — et qui ne désignent aucun véhicule qu'on connaisse.
 *
 * Elles portent leurs **dimensions utiles** — sans elles, le plan de chargement
 * ne dessine pas de plancher (G5/G6) et l'écran n'a rien à montrer en dev.
 *
 * 🔴 **Les cotes du Ford Transit City** (Hugo, 2026-10-14) : les vraies
 * camionnettes en sont. Cotes utiles recommandées par Ford (Van Reviewer),
 * version **L2H2** — 2940 × 1740 × 1710 mm ; la L1H1 fait 2640 × 1740 ×
 * 1450 mm. La version de chaque camionnette n'est pas encore connue : les
 * trois partent de L2H2, la plus grande — à corriger quand on saura.
 *
 * ⚠️ **Pas de passages de roue** : ni leur largeur intérieure, ni leur hauteur
 * n'ont été trouvées (2026-10-14), et le modèle les permet absents. Le
 * plancher est donc un rectangle, plus généreux que le vrai — à mesurer. La
 * caisse réfrigérée de la 2 est gardée du semis d'avant : rien ne dit encore
 * qu'une des Transit en ait une.
 */
const TRANSIT_CITY_L2H2 = { lengthCm: 294, widthCm: 174, heightCm: 171 } as const;

/** Une camionnette du semis : sa plaque est sa clé d'idempotence, donc toujours posée. */
export type SeededVehicle = VehiclePayload & { readonly plate: string };

export const FLEET: readonly SeededVehicle[] = [
  {
    name: "Camionnette 1",
    plate: "FG-481-KL",
    cargo: TRANSIT_CITY_L2H2,
    energy: "diesel",
  },
  {
    name: "Camionnette 2",
    plate: "FG-482-KL",
    cargo: TRANSIT_CITY_L2H2,
    refrigeration: { volumeLiters: 1500, minTempC: 0, maxTempC: 4 },
    energy: "diesel",
  },
  {
    name: "Camionnette 3",
    plate: "FG-483-KL",
    cargo: TRANSIT_CITY_L2H2,
    energy: "electric",
  },
];

/** Ce que le semis relit d'une camionnette déjà en base. */
export interface SeededVehicleRow {
  readonly name: string;
  readonly plate: string | null;
  readonly cargoLengthCm: number | null;
  readonly cargoWidthCm: number | null;
  readonly cargoHeightCm: number | null;
  readonly wheelArchLengthCm: number | null;
  readonly refrigeratedVolumeLiters: number | null;
  readonly energy: string | null;
}

/**
 * **La correction à poser sur une camionnette déjà en base**, ou `null`.
 *
 * Les plaques du semis sont au semis : dès que leurs cotes, leurs passages de
 * roue ou leur froid s'écartent de {@link FLEET}, on repose ceux du semis.
 * Jusqu'au 2026-10-14, une cote déjà renseignée n'était jamais reprise — la
 * flotte serait restée aux cotes inventées d'avant le Transit City. La
 * correction étant une charge COMPLÈTE (absent efface), le nom et l'énergie
 * déjà en base sont reportés tels quels.
 */
export function fleetCorrection(
  existing: SeededVehicleRow,
  seeded: VehiclePayload,
): VehiclePayload | null {
  const cargo = seeded.cargo ?? null;
  const same =
    existing.cargoLengthCm === (cargo?.lengthCm ?? null) &&
    existing.cargoWidthCm === (cargo?.widthCm ?? null) &&
    existing.cargoHeightCm === (cargo?.heightCm ?? null) &&
    existing.wheelArchLengthCm === (seeded.wheelArches?.lengthCm ?? null) &&
    existing.refrigeratedVolumeLiters === (seeded.refrigeration?.volumeLiters ?? null);
  if (same) {
    return null;
  }
  const energy = vehicleEnergySchema.safeParse(existing.energy);
  return {
    ...seeded,
    name: existing.name,
    plate: existing.plate,
    energy: energy.success ? energy.data : (seeded.energy ?? null),
  };
}

/**
 * **La flotte, idempotente par plaque.** Une camionnette absente est ajoutée,
 * une camionnette retirée sur le poste est remise en service, une camionnette
 * sans cotes reçoit celles du semis (`fleetCorrection`), les autres sont
 * laissées telles quelles — et aucun autre véhicule n'est touché.
 *
 * @returns l'identifiant de chaque camionnette, par nom.
 */
export async function seedFleet(context: RoundsContext): Promise<ReadonlyMap<string, string>> {
  const ids = new Map<string, string>();
  for (const vehicle of FLEET) {
    const existing = await context.prisma.deliveryVehicle.findFirst({
      where: { plate: vehicle.plate },
      select: {
        id: true,
        retiredAt: true,
        name: true,
        plate: true,
        cargoLengthCm: true,
        cargoWidthCm: true,
        cargoHeightCm: true,
        wheelArchLengthCm: true,
        refrigeratedVolumeLiters: true,
        energy: true,
      },
    });
    if (existing === null) {
      const id = await asStaff(context.now, () =>
        context.commands.execute<AddVehicleCommand, string>(new AddVehicleCommand(vehicle)),
      );
      ids.set(vehicle.name, id);
      continue;
    }
    await reviveSeededVehicle(context, existing, vehicle);
    ids.set(vehicle.name, existing.id);
  }
  return ids;
}

/** Remet en service et pose les cotes d'une camionnette déjà en base, au besoin. */
async function reviveSeededVehicle(
  context: RoundsContext,
  existing: SeededVehicleRow & { readonly id: string; readonly retiredAt: Date | null },
  vehicle: VehiclePayload,
): Promise<void> {
  if (existing.retiredAt !== null) {
    await asStaff(context.now, () =>
      context.commands.execute(new ReactivateVehicleCommand(existing.id)),
    );
  }
  const correction = fleetCorrection(existing, vehicle);
  if (correction !== null) {
    await asStaff(context.now, () =>
      context.commands.execute(new CorrectVehicleCommand(existing.id, correction)),
    );
  }
}
