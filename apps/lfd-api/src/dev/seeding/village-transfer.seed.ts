import { SetSiteRolesCommand } from "../../b2b/sites/application/set-site-roles.command.js";
import type { RoundsContext } from "./delivery-rounds.seed.js";
import { asStaff } from "./order-placing.seed.js";

/**
 * **Le Village, approvisionné par transfert** (Hugo, 2026-10-14) : ses
 * retraits partent du Labo dans un transfert interne, que la composition
 * place dans une tournée (mode intégré).
 *
 * Le point GPS est celui du centre du village — avenue Olympique, place de
 * l'église —, donné par Hugo le même jour. L'agrégat du site refuse « par
 * transfert » sans point : les deux voyagent dans la même écriture.
 */
const VILLAGE_LABEL = "Le Village";
const VILLAGE_GPS = { lat: 45.4485, lng: 6.9798 } as const;

/**
 * Pose les rôles du Village par la commande de l'écran des sites, ses autres
 * rôles inchangés. Rejoué à chaque semis ; ne fait rien si c'est déjà le cas.
 */
export async function supplyVillageByTransfer(context: RoundsContext): Promise<void> {
  const village = await context.prisma.site.findFirst({
    where: { label: VILLAGE_LABEL },
    select: {
      id: true,
      pickup: true,
      supply: true,
      deliveryDeparture: true,
      transferMode: true,
      counterSetupMinutes: true,
      gps: true,
    },
  });
  if (village === null) {
    throw new Error(`Point « ${VILLAGE_LABEL} » absent : semer la station avant le scénario.`);
  }
  const { id, gps, supply, transferMode, ...roles } = village;
  const settled = supply === "transfer" && transferMode === "integrated" && isVillagePoint(gps);
  if (settled) {
    return;
  }
  await asStaff(context.now, () =>
    context.commands.execute(
      new SetSiteRolesCommand(id, {
        ...roles,
        supply: "transfer",
        transferMode: "integrated",
        gps: VILLAGE_GPS,
      }),
    ),
  );
}

/** Le point en base est-il déjà celui du village ? (`jsonb` : lu sans le supposer.) */
function isVillagePoint(gps: unknown): boolean {
  if (typeof gps !== "object" || gps === null) {
    return false;
  }
  return "lat" in gps && gps.lat === VILLAGE_GPS.lat && "lng" in gps && gps.lng === VILLAGE_GPS.lng;
}
