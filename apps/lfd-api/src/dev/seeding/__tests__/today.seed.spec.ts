import { CloseProductionDayCommand } from "../../../production/application/commands/close-production-day.command.js";
import { MarkWorksheetLineCommand } from "../../../production/application/commands/mark-worksheet-line.command.js";
import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import {
  type AutoComposedRounds,
  type PlanStopSettings,
  bakeToday,
  closeTodayPlan,
  scenarioDayOf,
  type StepContext,
} from "../today.seed.js";

/**
 * Les étapes courtes du scénario : chacune par le vrai geste, dans un contexte
 * daté, et la boîte d'envoi attendue APRÈS le geste — l'étape suivante lit ce
 * que les abonnés ont écrit.
 */

/** Un instant quelconque : les étapes ne le comparent jamais à l'horloge, elles en dérivent. */
// 14 h 30 à Paris (heure d'été), écrit en instant : le test ne dépend pas du fuseau de la machine.
const NOW = new Date("2026-10-05T12:30:00.000Z");
const DAY = scenarioDayOf(NOW);

/** Les réglages d'arrêt : `resupply` l'heure du réassort, `null` = ligne absente. */
function stopSettings(resupply: string | null = null): PlanStopSettings {
  return {
    orderCutoff: {
      findFirst: () => Promise.resolve({ daysBefore: 1, time: "18:00", graceMinutes: 60 }),
    },
    orderCutoffSettings: {
      findUnique: () =>
        Promise.resolve(resupply === null ? null : { resupplyCutoffTime: resupply }),
    },
  };
}

/** Un bus et une boîte d'envoi qui notent ce qu'on leur demande, dans l'ordre. */
function recorder(settings: PlanStopSettings = stopSettings()) {
  const journal: string[] = [];
  const instants: Date[] = [];
  const context: StepContext & { readonly prisma: AutoComposedRounds & PlanStopSettings } = {
    commands: {
      execute: (command) => {
        journal.push(
          command instanceof CloseProductionDayCommand
            ? `close ${command.serviceDay}`
            : `mark ${command.serviceDay} ${command.sku}`,
        );
        const now = currentRequestContext()?.now;
        if (now !== undefined) {
          instants.push(now);
        }
        return Promise.resolve(undefined);
      },
    },
    settle: () => {
      journal.push("settle");
      return Promise.resolve();
    },
    prisma: {
      ...settings,
      deliveryRound: {
        findMany: () => Promise.resolve([{ id: "r_auto" }]),
        deleteMany: (args: { where: { serviceDay: string } }) => {
          journal.push(`clear rounds ${args.where.serviceDay}`);
          return Promise.resolve();
        },
      },
      activityEvent: {
        deleteMany: (args: { where: { subjectType: string; subjectId: { in: string[] } } }) => {
          journal.push(`clear events ${args.where.subjectId.in.join(",")}`);
          return Promise.resolve();
        },
      },
      deliveryRoundStop: {
        deleteMany: (args: { where: { round: { serviceDay: string } } }) => {
          journal.push(`clear stops ${args.where.round.serviceDay}`);
          return Promise.resolve();
        },
      },
    },
  };
  return { journal, instants, context };
}

describe("scenarioDayOf", () => {
  it("cale la journée sur l'instant, commandée la veille à la même heure", () => {
    expect(DAY.forDay).toBe("2026-10-05");
    expect(DAY.today.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(DAY.orderedAt.toISOString()).toBe("2026-10-04T07:00:00.000Z");
  });

  /**
   * Régression : la CI (UTC) lancée le 2026-10-28 à 23:44 UTC — 00:44 à Paris
   * le 29 — prenait la journée du 28, déjà passée pour la plateforme, et la
   * composition des tournées levait `PastServiceDayCompositionError`.
   */
  it("prend la journée de Paris, pas celle de la machine, juste après minuit à Paris", () => {
    const day = scenarioDayOf(new Date("2026-10-28T23:44:00.000Z"));

    expect(day.forDay).toBe("2026-10-29");
    expect(day.today.toISOString()).toBe("2026-10-29T08:00:00.000Z");
    expect(day.orderedAt.toISOString()).toBe("2026-10-28T08:00:00.000Z");
  });

  it("prend la journée de Paris en heure d'été, entre minuit et 2 h", () => {
    const day = scenarioDayOf(new Date("2026-07-14T22:30:00.000Z"));

    expect(day.forDay).toBe("2026-07-15");
    expect(day.today.toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(day.orderedAt.toISOString()).toBe("2026-07-14T07:00:00.000Z");
  });

  it("garde 9 h à Paris des deux côtés de la nuit du changement d'heure", () => {
    // 2026-10-25 à 02:30 Paris, heure d'hiver déjà : la veille était en heure d'été.
    const day = scenarioDayOf(new Date("2026-10-25T01:30:00.000Z"));

    expect(day.forDay).toBe("2026-10-25");
    expect(day.today.toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(day.orderedAt.toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });
});

describe("closeTodayPlan — étape 1", () => {
  it("arrête le plan du jour au soir de la veille, puis attend la boîte d'envoi", async () => {
    const { journal, instants, context } = recorder();

    await closeTodayPlan(context, DAY);

    // Puis efface ce que l'arrêt a composé tout seul (2026-10-07) : le
    // scénario lit son étape dans la base.
    expect(journal).toEqual([
      "close 2026-10-05",
      "settle",
      "clear events r_auto",
      "clear stops 2026-10-05",
      "clear rounds 2026-10-05",
    ]);
    expect(instants[0]?.toISOString()).toBe("2026-10-04T18:00:00.000Z");
  });

  /**
   * Régression : `POST /admin/dev/seed/reload` répondait 409
   * `production.day.before_order_cutoff` le 2026-10-25 — l'heure du réassort
   * de la base de dev était réglée à 23:00, et le semis arrêtait à 20 h.
   */
  it("arrête à l'heure du réassort quand elle est plus tardive que le soir", async () => {
    const day = scenarioDayOf(new Date("2026-10-25T14:00:00.000Z"));
    const { instants, context } = recorder(stopSettings("23:00"));

    await closeTodayPlan(context, day);

    expect(instants[0]?.toISOString()).toBe("2026-10-24T21:00:00.000Z");
  });
});

describe("bakeToday — étape 2", () => {
  it("coche chaque article du compte, dans l'ordre du SKU, puis attend une fois", async () => {
    const { journal, context } = recorder();
    const read: unknown[] = [];
    const prisma = {
      productionCount: {
        findMany: (args: unknown) => {
          read.push(args);
          return Promise.resolve([{ sku: "PAI-001" }, { sku: "VIE-001" }]);
        },
      },
    };

    const items = await bakeToday({ ...context, prisma }, DAY);

    expect(items).toBe(2);
    expect(read).toEqual([
      { where: { serviceDay: "2026-10-05" }, select: { sku: true }, orderBy: { sku: "asc" } },
    ]);
    expect(journal).toEqual(["mark 2026-10-05 PAI-001", "mark 2026-10-05 VIE-001", "settle"]);
  });

  it("ne coche rien et attend quand même, sur une journée sans compte", async () => {
    const { journal, context } = recorder();
    const prisma = { productionCount: { findMany: () => Promise.resolve([]) } };

    expect(await bakeToday({ ...context, prisma }, DAY)).toBe(0);
    expect(journal).toEqual(["settle"]);
  });
});

/** Le type de la commande reste celui du vrai geste, pas une imitation. */
describe("les gestes envoyés", () => {
  it("sont les vraies commandes du fournil", async () => {
    const sent: unknown[] = [];
    const context: StepContext = {
      commands: {
        execute: (command) => {
          sent.push(command);
          return Promise.resolve(undefined);
        },
      },
      settle: () => Promise.resolve(),
    };
    const prisma = { productionCount: { findMany: () => Promise.resolve([{ sku: "VIE-001" }]) } };
    const rounds = {
      ...stopSettings(),
      deliveryRoundStop: { deleteMany: () => Promise.resolve() },
      deliveryRound: { findMany: () => Promise.resolve([]), deleteMany: () => Promise.resolve() },
      activityEvent: { deleteMany: () => Promise.resolve() },
    };

    await closeTodayPlan({ ...context, prisma: rounds }, DAY);
    await bakeToday({ ...context, prisma }, DAY);

    expect(sent[0]).toBeInstanceOf(CloseProductionDayCommand);
    expect(sent[1]).toBeInstanceOf(MarkWorksheetLineCommand);
  });
});
