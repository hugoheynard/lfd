import { instantToLocal } from "@lfd/contracts";

import { AddSiteResupplyLineCommand } from "../../../b2b/resupply/application/add-site-resupply-line.command.js";
import { NameSiteResupplyCommand } from "../../../b2b/resupply/application/name-site-resupply.command.js";
import { SendSiteResupplyCommand } from "../../../b2b/resupply/application/send-site-resupply.command.js";
import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import type { SeedLine } from "../order-placing.seed.js";
import { scenarioDayOf } from "../today.seed.js";
import {
  AFTERNOON_RESUPPLY_HOUR,
  AFTERNOON_RESUPPLY_NAME,
  seedVillageAfternoonResupply,
  type VillageResupplyContext,
} from "../village-resupply.seed.js";

/**
 * Le réassort de démonstration du Village (lot R5) : les trois gestes du
 * comptoir, dans l'ordre, l'après-midi de J — et rien de plus au rejeu.
 */

/** Un instant quelconque : le semis n'en compare aucun à l'horloge, il en dérive. */
// 14 h 30 à Paris (heure d'été), écrit en instant : le test ne dépend pas du fuseau de la machine.
const DAY = scenarioDayOf(new Date("2026-10-05T12:30:00.000Z"));
const WIDE: readonly SeedLine[] = [
  { sku: "VIE-001-1", quantity: 3 },
  { sku: "SAU-001-1", quantity: 500, saleUnit: "weight" },
  { sku: "PAI-002-1", quantity: 2 },
  { sku: "PAI-003-1", quantity: 1 },
];

interface Stored {
  readonly id: string;
  readonly version: number;
  readonly placedAt: Date | null;
}

function scene(village: string | null, stored: Stored | null) {
  const journal: string[] = [];
  const hours: number[] = [];
  let current = stored;
  const context: VillageResupplyContext = {
    commands: {
      execute: (command) => {
        journal.push(gestureOf(command));
        const now = currentRequestContext()?.now;
        hours.push(now === undefined ? -1 : Number(instantToLocal(now).time.slice(0, 2)));
        if (command instanceof NameSiteResupplyCommand) {
          current = { id: "rs-1", version: 2, placedAt: null };
        }
        return Promise.resolve(undefined);
      },
    },
    prisma: {
      site: { findFirst: () => Promise.resolve(village === null ? null : { id: village }) },
      siteResupply: {
        findFirst: (args) => {
          journal.push(`read ${args.where.name}`);
          return Promise.resolve(current);
        },
      },
    },
  };
  return { context, journal, hours };
}

function gestureOf(command: unknown): string {
  if (command instanceof NameSiteResupplyCommand) {
    return `name ${command.target} ${command.name ?? ""}`;
  }
  if (command instanceof AddSiteResupplyLineCommand) {
    return `add ${command.sku} ${String(command.quantity)}`;
  }
  if (command instanceof SendSiteResupplyCommand) {
    return `send ${command.resupplyId} v${String(command.seenVersion)}`;
  }
  return "?";
}

describe("seedVillageAfternoonResupply", () => {
  it("nomme, remplit à la pièce et envoie « au plus tôt », l'après-midi de J", async () => {
    const { context, journal, hours } = scene("village", null);
    expect(await seedVillageAfternoonResupply(context, DAY.today, DAY.forDay, WIDE)).toBe("rs-1");
    expect(journal).toEqual([
      `read ${AFTERNOON_RESUPPLY_NAME}`,
      `name asap ${AFTERNOON_RESUPPLY_NAME}`,
      "add VIE-001-1 6",
      "add PAI-002-1 6",
      `read ${AFTERNOON_RESUPPLY_NAME}`,
      "send rs-1 v2",
    ]);
    expect(new Set(hours)).toEqual(new Set([AFTERNOON_RESUPPLY_HOUR]));
  });

  it("rejoué, ne renvoie pas un réassort déjà envoyé", async () => {
    const placed = { id: "rs-0", version: 3, placedAt: DAY.today };
    const { context, journal } = scene("village", placed);
    expect(await seedVillageAfternoonResupply(context, DAY.today, DAY.forDay, WIDE)).toBe("rs-0");
    expect(journal).toEqual([`read ${AFTERNOON_RESUPPLY_NAME}`]);
  });

  it("ne sème rien sans le Village", async () => {
    const { context, journal } = scene(null, null);
    expect(await seedVillageAfternoonResupply(context, DAY.today, DAY.forDay, WIDE)).toBeNull();
    expect(journal).toEqual([]);
  });
});
