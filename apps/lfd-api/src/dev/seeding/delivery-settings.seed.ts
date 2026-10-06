import type { DeliveryRoutingSettingsPayload } from "@lfd/contracts";

import { SetRoutingSettingsCommand } from "../../delivery/application/commands/set-routing-settings.command.js";
import { ROUTING_SETTINGS_KEY } from "../../delivery/infrastructure/routing-settings.key.js";
import { LABO } from "./counter-day.seed.js";
import { BIN_MANNE, seedBinTypes } from "./delivery-bins.seed.js";
import { seedFleet } from "./delivery-fleet.seed.js";
import { chooseLaboDeparture, type RoundsContext } from "./delivery-rounds.seed.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";

/**
 * **Les réglages de livraison par défaut** (Hugo, 2026-10-06 : « si on arrive
 * à avoir des réglages par défaut »), posés dès la remise à l'état de base :
 * sans eux, « Proposer » sur demain refuse (CA-D3) tant que l'étape des
 * tournées d'aujourd'hui n'a pas tourné.
 *
 * La flotte mesurée, les types de bacs et leurs contenances, le départ du
 * Labo, et les réglages du calcul — chacun par sa commande.
 */

/** Ce que le semis relit des réglages du calcul en place. */
export interface RoutingSettingsRow {
  readonly earliestDeparture: string;
  readonly maxRoundMinutes: number;
  readonly stopMinutes: number;
  readonly defaultMode: string;
  readonly multiplePassages: boolean;
  readonly safetyMarginMinutes: number;
  readonly defaultBinTypeId: string | null;
  readonly defaultBinCount: number | null;
}

/**
 * **Les réglages de la démo.** Deux s'écartent des valeurs d'usine, et ce
 * sont eux qui font la journée de demain :
 *
 * - `multiplePassages: false` : une camionnette ne revient pas recharger. Le
 *   départ se calcule dès minuit (CA-D1) ; avec un second passage, deux
 *   camionnettes auraient le temps de tout faire en deux allers, et la place
 *   au sol ne contraindrait plus rien ;
 * - le contenant par défaut, une manne : une commande dont on ne sait rien
 *   occupe une manne au sol (CA4b), au lieu d'être placée sans contrôle.
 *
 * Le reste : départ au plus tôt 05:30 quand rien ne presse, six minutes par
 * arrêt (des mannes à porter), quinze de marge.
 */
export function demoRoutingSettings(manneTypeId: string): DeliveryRoutingSettingsPayload {
  return {
    earliestDeparture: "05:30",
    maxRoundMinutes: 240,
    stopMinutes: 6,
    defaultMode: "new_rounds",
    multiplePassages: false,
    safetyMarginMinutes: 15,
    defaultContainer: { binTypeId: manneTypeId, count: 1 },
  };
}

/**
 * Les réglages à poser, ou `null` s'ils sont déjà ceux de la démo. Poser des
 * réglages inchangés écrirait un fait au journal à chaque rechargement — et la
 * remise à l'état de base doit laisser chaque table de la même taille.
 *
 * ⚠️ Des réglages changés à la main sur le poste sont REMIS à ceux de la démo :
 * c'est un rechargement, et la journée de demain n'a de sens qu'avec eux.
 */
export function routingSettingsToPose(
  current: RoutingSettingsRow | null,
  wanted: DeliveryRoutingSettingsPayload,
): DeliveryRoutingSettingsPayload | null {
  if (current === null) {
    return wanted;
  }
  const same =
    current.earliestDeparture === wanted.earliestDeparture &&
    current.maxRoundMinutes === wanted.maxRoundMinutes &&
    current.stopMinutes === wanted.stopMinutes &&
    current.defaultMode === wanted.defaultMode &&
    current.multiplePassages === wanted.multiplePassages &&
    current.safetyMarginMinutes === wanted.safetyMarginMinutes &&
    current.defaultBinTypeId === (wanted.defaultContainer?.binTypeId ?? null) &&
    current.defaultBinCount === (wanted.defaultContainer?.count ?? null);
  return same ? null : wanted;
}

/** La flotte, les bacs, le départ et les réglages du calcul — idempotent. */
export async function seedDeliverySettings(context: RoundsContext): Promise<void> {
  await seedFleet(context);
  const binTypes = await seedBinTypes(context);
  await chooseLaboDeparture(context, LABO);
  const manneTypeId = binTypes.get(BIN_MANNE);
  if (manneTypeId === undefined) {
    throw new Error(`Type « ${BIN_MANNE} » absent après le semis des bacs.`);
  }
  const current = await context.prisma.deliveryRoutingSettings.findUnique({
    where: { key: ROUTING_SETTINGS_KEY },
    select: {
      earliestDeparture: true,
      maxRoundMinutes: true,
      stopMinutes: true,
      defaultMode: true,
      multiplePassages: true,
      safetyMarginMinutes: true,
      defaultBinTypeId: true,
      defaultBinCount: true,
    },
  });
  const payload = routingSettingsToPose(current, demoRoutingSettings(manneTypeId));
  if (payload !== null) {
    await asStaff(context.now, () =>
      context.commands.execute(new SetRoutingSettingsCommand(payload, SEED_STAFF_SUB)),
    );
  }
}
