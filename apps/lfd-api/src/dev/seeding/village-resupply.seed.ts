import { BusinessError } from "../../platform/shared/errors/app-error.js";
import { AddSiteResupplyLineCommand } from "../../b2b/resupply/application/add-site-resupply-line.command.js";
import { NameSiteResupplyCommand } from "../../b2b/resupply/application/name-site-resupply.command.js";
import { SendSiteResupplyCommand } from "../../b2b/resupply/application/send-site-resupply.command.js";
import { VILLAGE } from "./counter-day.seed.js";
import { asStaff, atHour, SEED_STAFF_SUB, type SeedLine } from "./order-placing.seed.js";

/** Le nom du réassort semé — aussi sa clé : rejoué, le semis le retrouve. */
export const AFTERNOON_RESUPPLY_NAME = "Vitrine de l'après-midi";

/** L'heure de l'envoi, l'après-midi de J (lot R5 du réassort, 2026-10-14). */
export const AFTERNOON_RESUPPLY_HOUR = 15;

/** Les pièces demandées pour chaque article. */
const AFTERNOON_PIECES = 6;

/** Combien d'articles du jour la demande porte. */
const AFTERNOON_ARTICLES = 2;

/** Les gestes que le semis envoie au bus, et rien d'autre. */
type ResupplyGesture =
  AddSiteResupplyLineCommand | NameSiteResupplyCommand | SendSiteResupplyCommand;

/**
 * Ce que le semis touche : le bus réduit à ses trois gestes, et les deux
 * lectures qui retrouvent le point et le réassort. Déclaré plutôt que le
 * `SeedContext` entier, pour que le doublé de test n'ait pas à fabriquer un
 * `PrismaClient` (même raison que `StepContext` dans `today.seed.ts`).
 */
export interface VillageResupplyContext {
  readonly commands: { execute(command: ResupplyGesture): Promise<unknown> };
  readonly prisma: {
    readonly site: {
      findFirst(args: {
        where: { label: string };
        select: { id: true };
      }): Promise<{ readonly id: string } | null>;
    };
    readonly siteResupply: {
      findFirst(args: {
        where: { siteId: string; serviceDay: Date; name: string };
        select: { id: true; version: true; placedAt: true };
      }): Promise<{
        readonly id: string;
        readonly version: number;
        readonly placedAt: Date | null;
      } | null>;
    };
  };
}

/**
 * **Un réassort « au plus tôt » du Village, l'après-midi de J** (lot R5 du
 * plan du réassort, 2026-10-14 ; `reassort-boutiques/reste-a-faire.md` § 4) :
 * le comptoir nomme sa demande en cours, y pose deux articles du jour, et
 * l'envoie — par les VRAIS handlers, à 15 h, comme un vendeur en plein
 * service. Il attend ensuite « Lancer » au fournil (Prod manager ›
 * Réassorts) : le semis ne le lance pas, pour que l'écran ait un geste à
 * montrer.
 *
 * Rejoué, il ne double pas : un réassort du même nom, déjà envoyé ce jour-là
 * au Village, suffit. La purge du scénario ne l'emporte pas (elle ne touche
 * qu'aux sorties de réserve, `resupply.purge.ts`), d'où cette clé.
 *
 * @returns l'identifiant du réassort, ou `null` si le Village n'est pas semé
 *   ou si aucun article à la pièce n'est disponible.
 */
export async function seedVillageAfternoonResupply(
  context: VillageResupplyContext,
  today: Date,
  forDay: string,
  wide: readonly SeedLine[],
): Promise<string | null> {
  const village = await context.prisma.site.findFirst({
    where: { label: VILLAGE },
    select: { id: true },
  });
  const articles = wide.filter((line) => line.saleUnit !== "weight").slice(0, AFTERNOON_ARTICLES);
  if (village === null || articles.length === 0) {
    return null;
  }
  const seeded = await readSeeded(context, village.id, forDay);
  if (seeded !== null && seeded.placedAt !== null) {
    return seeded.id;
  }
  const at = atHour(today, AFTERNOON_RESUPPLY_HOUR);
  return asStaff(at, async () => {
    await context.commands.execute(
      new NameSiteResupplyCommand(village.id, "asap", AFTERNOON_RESUPPLY_NAME),
    );
    for (const article of articles) {
      await context.commands.execute(
        new AddSiteResupplyLineCommand(village.id, "asap", article.sku, AFTERNOON_PIECES),
      );
    }
    const draft = await readSeeded(context, village.id, forDay);
    if (draft === null) {
      throw new VillageResupplyNotDraftedError(forDay);
    }
    await context.commands.execute(
      new SendSiteResupplyCommand(village.id, draft.id, draft.version, SEED_STAFF_SUB),
    );
    return draft.id;
  });
}

/** Le réassort semé ce jour-là au Village, retrouvé par son nom. */
function readSeeded(context: VillageResupplyContext, siteId: string, forDay: string) {
  return context.prisma.siteResupply.findFirst({
    where: {
      siteId,
      serviceDay: new Date(`${forDay}T00:00:00.000Z`),
      name: AFTERNOON_RESUPPLY_NAME,
    },
    select: { id: true, version: true, placedAt: true },
  });
}

/** Le comptoir a nommé et rempli sa demande, et la base ne la porte pas. */
export class VillageResupplyNotDraftedError extends BusinessError {
  constructor(forDay: string) {
    super(
      "dev.village_resupply.not_drafted",
      `La demande « ${AFTERNOON_RESUPPLY_NAME} » du Village pour le ${forDay} est introuvable ` +
        "après son remplissage : relancer le semis ; si elle manque encore, lire le journal de l'API.",
    );
  }
}
