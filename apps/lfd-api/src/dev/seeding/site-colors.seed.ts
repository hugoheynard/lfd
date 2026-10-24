import type { SiteColorsPayload } from "@lfd/contracts";

import { SetSiteColorsCommand } from "../../b2b/sites/application/set-site-colors.command.js";
import { LABO, VILLAGE } from "./counter-day.seed.js";
import { asStaff, type SeedContext } from "./order-placing.seed.js";

/**
 * **Les couleurs des deux sites**, posées par la commande de l'écran des sites
 * (`documentation/commandes/back-office/plan-tri-depart-et-couleurs.md` §4).
 *
 * Les teintes suivent la demande logistique — bleu la livraison pro, jaune le
 * retrait pro, orange le retrait particulier du Labo, gris celui du Village —
 * sans vert ni rouge, gardés aux surligneurs OK / KO. La livraison particulier
 * n'avait pas de couleur demandée : violet, la seule teinte franche qui reste.
 *
 * Le Labo seul livre (`deliveryDeparture`) : lui seul porte les couleurs de
 * livraison. Le Village, approvisionné par transfert, n'a que ses deux couleurs
 * de retrait — et aucun site n'est laissé sans couleur (Hugo, 2026-10-14).
 */
export const SEEDED_SITE_COLORS: ReadonlyMap<string, SiteColorsPayload> = new Map([
  [
    LABO,
    {
      pickupColorB2b: "#f2c200",
      pickupColorB2c: "#f28c28",
      deliveryColorB2b: "#1f6fd1",
      deliveryColorB2c: "#7b4fc9",
    },
  ],
  [
    VILLAGE,
    {
      pickupColorB2b: "#f2c200",
      pickupColorB2c: "#8a8f98",
      deliveryColorB2b: null,
      deliveryColorB2c: null,
    },
  ],
]);

/**
 * Peint chaque site déclaré, s'il ne l'est pas déjà ainsi : repeindre à
 * l'identique écrirait un fait au journal à chaque rechargement.
 */
export async function paintSeededSites(context: SeedContext): Promise<void> {
  for (const [label, wanted] of SEEDED_SITE_COLORS) {
    const site = await context.prisma.site.findFirst({
      where: { label },
      select: {
        id: true,
        pickupColorB2b: true,
        pickupColorB2c: true,
        deliveryColorB2b: true,
        deliveryColorB2c: true,
      },
    });
    if (site === null) {
      throw new Error(`Point « ${label} » absent : semer la station avant ses couleurs.`);
    }
    const { id, ...current } = site;
    if (sameColors(current, wanted)) {
      continue;
    }
    await asStaff(context.now, () =>
      context.commands.execute(new SetSiteColorsCommand(id, wanted)),
    );
  }
}

/** Les quatre couleurs en base sont-elles celles voulues ? */
export function sameColors(current: SiteColorsPayload, wanted: SiteColorsPayload): boolean {
  return (
    current.pickupColorB2b === wanted.pickupColorB2b &&
    current.pickupColorB2c === wanted.pickupColorB2c &&
    current.deliveryColorB2b === wanted.deliveryColorB2b &&
    current.deliveryColorB2c === wanted.deliveryColorB2c
  );
}
