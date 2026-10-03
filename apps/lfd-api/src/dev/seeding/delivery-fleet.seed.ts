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
 * ne dessine pas de plancher (G5/G6) et l'écran n'a rien à montrer en dev. Cotes
 * d'utilitaires courants, variées pour que le plancher change d'un véhicule à
 * l'autre ; la 1 (celle de la tournée semée) a ses passages de roue, la 2 une
 * caisse réfrigérée, la 3 reste un plancher rectangle sec.
 */
export const FLEET: readonly VehiclePayload[] = [
  {
    name: "Camionnette 1",
    plate: "FG-481-KL",
    cargo: { lengthCm: 260, widthCm: 166, heightCm: 145 },
    wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 80, heightCm: 30 },
    energy: "diesel",
  },
  {
    name: "Camionnette 2",
    plate: "FG-482-KL",
    cargo: { lengthCm: 250, widthCm: 160, heightCm: 140 },
    wheelArches: { lengthCm: 95, protrusionCm: 18, fromBackCm: 75, heightCm: 28 },
    refrigeration: { volumeLiters: 1500, minTempC: 0, maxTempC: 4 },
    energy: "diesel",
  },
  {
    name: "Camionnette 3",
    plate: "FG-483-KL",
    cargo: { lengthCm: 230, widthCm: 150, heightCm: 130 },
    energy: "electric",
  },
];

/** Ce que le semis relit d'une camionnette déjà en base. */
export interface SeededVehicleRow {
  readonly name: string;
  readonly plate: string;
  readonly cargoLengthCm: number | null;
  readonly wheelArchLengthCm: number | null;
  readonly refrigeratedVolumeLiters: number | null;
  readonly energy: string | null;
}

/**
 * **La correction à poser sur une camionnette déjà en base**, ou `null`.
 *
 * Un véhicule semé avant que la flotte porte ses cotes n'a ni chargement, ni
 * passages, ni froid : on lui pose ceux du semis. Dès que l'un des trois est
 * renseigné, c'est une saisie (à la main ou d'un semis précédent) et on n'y
 * touche pas. La correction étant une charge COMPLÈTE (absent efface), le nom
 * et l'énergie déjà en base sont reportés tels quels.
 */
export function fleetCorrection(
  existing: SeededVehicleRow,
  seeded: VehiclePayload,
): VehiclePayload | null {
  const measured =
    existing.cargoLengthCm !== null ||
    existing.wheelArchLengthCm !== null ||
    existing.refrigeratedVolumeLiters !== null;
  if (measured) {
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
