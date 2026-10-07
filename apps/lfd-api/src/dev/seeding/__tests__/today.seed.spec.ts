import { CloseProductionDayCommand } from "../../../production/application/commands/close-production-day.command.js";
import { MarkWorksheetLineCommand } from "../../../production/application/commands/mark-worksheet-line.command.js";
import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import {
  type AutoComposedRounds,
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
const NOW = new Date(2026, 9, 5, 14, 30);
const DAY = scenarioDayOf(NOW);

/** Un bus et une boîte d'envoi qui notent ce qu'on leur demande, dans l'ordre. */
function recorder() {
  const journal: string[] = [];
  const instants: Date[] = [];
  const context: StepContext & { readonly prisma: AutoComposedRounds } = {
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
    expect(DAY.today.getHours()).toBe(9);
    expect(DAY.orderedAt.getDate()).toBe(4);
    expect(DAY.orderedAt.getHours()).toBe(9);
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
    expect(instants[0]?.getDate()).toBe(4);
    expect(instants[0]?.getHours()).toBe(20);
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
