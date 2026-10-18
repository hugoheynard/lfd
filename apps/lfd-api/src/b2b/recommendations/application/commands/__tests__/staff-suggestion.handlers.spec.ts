import { instantToLocal } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  SuggestionPeriodOverError,
  SuggestionRuleArchivedError,
  SuggestionRuleNotFoundError,
  UnknownSuggestionCatalogueError,
  UnknownSuggestionOrderError,
} from "../../../domain/errors/staff-suggestion-errors.js";
import { ArchiveStaffSuggestionCommand } from "../archive-staff-suggestion.command.js";
import { ArchiveStaffSuggestionHandler } from "../archive-staff-suggestion.handler.js";
import { CreateStaffSuggestionCommand } from "../create-staff-suggestion.command.js";
import { CreateStaffSuggestionHandler } from "../create-staff-suggestion.handler.js";
import { ReviseStaffSuggestionCommand } from "../revise-staff-suggestion.command.js";
import { ReviseStaffSuggestionHandler } from "../revise-staff-suggestion.handler.js";
import { SetStaffSuggestionActiveCommand } from "../set-staff-suggestion-active.command.js";
import { SetStaffSuggestionActiveHandler } from "../set-staff-suggestion-active.handler.js";
import { SetStaffSuggestionOrderCommand } from "../set-staff-suggestion-order.command.js";
import { SetStaffSuggestionOrderHandler } from "../set-staff-suggestion-order.handler.js";
import {
  croissantInput,
  InMemoryRules,
  KnownFamilies,
  OrderReader,
  OrderSetting,
  OrderWriter,
  ServedSkus,
} from "./staff-suggestion-doubles.js";

/** L'horloge est fixe, et le jour métier en est tiré : rien n'y dépend du calendrier réel. */
const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

function scene() {
  const rules = new InMemoryRules();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const skus = new ServedSkus(["VIE-001", "BOI-001", "BOI-002"]);
  const families = new KnownFamilies(["cat_vie"]);
  const create = new CreateStaffSuggestionHandler(
    rules,
    skus,
    families,
    new FixedIdGenerator("rule"),
    clock,
    events,
    uow,
  );
  const revise = new ReviseStaffSuggestionHandler(rules, skus, families, clock, events, uow);
  const setActive = new SetStaffSuggestionActiveHandler(rules, clock, events, uow);
  const archive = new ArchiveStaffSuggestionHandler(rules, clock, events, uow);
  return { rules, events, create, revise, setActive, archive };
}

describe("CreateStaffSuggestionHandler", () => {
  it("crée la règle, signée, et la journalise avec tout ce qu'elle dit", async () => {
    const { rules, events, create } = scene();
    const id = await create.execute(
      new CreateStaffSuggestionCommand(croissantInput(TODAY), "staff_1"),
    );

    expect(id).toBe("rule_000001");
    expect(rules.store.stored(id)).toMatchObject({
      active: true,
      created: { by: "staff_1", at: NOW },
    });
    expect(events.factTypes()).toEqual(["staff_suggestion.created"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "staff_suggestion",
      subjectId: id,
      payload: {
        subjectLabel: "Avec un croissant, le café",
        trigger: "product_in_cart",
        triggerRef: "VIE-001",
        skus: ["BOI-001"],
        startsOn: TODAY,
      },
    });
  });

  it("refuse un article que le catalogue ne sert pas, sans rien écrire", async () => {
    const { rules, events, create } = scene();
    const input = croissantInput(TODAY, { suggestedSkus: ["BOI-001", "ZZZ-404"] });
    await expect(
      create.execute(new CreateStaffSuggestionCommand(input, "staff_1")),
    ).rejects.toThrow(UnknownSuggestionCatalogueError);
    expect(rules.store.adds).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse une famille inconnue, et accepte une famille connue", async () => {
    const { create } = scene();
    const family = (ref: string) =>
      croissantInput(TODAY, { trigger: { kind: "category_in_cart", ref } });
    await expect(
      create.execute(new CreateStaffSuggestionCommand(family("cat_404"), null)),
    ).rejects.toThrow(UnknownSuggestionCatalogueError);
    await expect(
      create.execute(new CreateStaffSuggestionCommand(family("cat_vie"), null)),
    ).resolves.toBe("rule_000002");
  });

  it("refuse une règle déjà finie au jour métier du Clock", async () => {
    const { create } = scene();
    const input = croissantInput(TODAY, { startsOn: "2026-10-01", endsOn: "2026-10-17" });
    await expect(create.execute(new CreateStaffSuggestionCommand(input, null))).rejects.toThrow(
      SuggestionPeriodOverError,
    );
  });
});

describe("ReviseStaffSuggestionHandler", () => {
  it("réécrit, journalise le diff seul, et ne dit rien d'une réécriture sans effet", async () => {
    const { rules, events, create, revise } = scene();
    const id = await create.execute(
      new CreateStaffSuggestionCommand(croissantInput(TODAY), "staff_1"),
    );

    await revise.execute(new ReviseStaffSuggestionCommand(id, croissantInput(TODAY), "staff_2"));
    await revise.execute(
      new ReviseStaffSuggestionCommand(
        id,
        croissantInput(TODAY, { suggestedSkus: ["BOI-002"], priority: 4 }),
        "staff_2",
      ),
    );

    expect(rules.store.saves).toBe(1);
    expect(rules.store.stored(id)).toMatchObject({ priority: 4, lastWrite: { by: "staff_2" } });
    expect(events.factTypes()).toEqual(["staff_suggestion.created", "staff_suggestion.revised"]);
    expect(events.traced[1]?.journalFact().payload["changes"]).toEqual({
      skus: { from: ["BOI-001"], to: ["BOI-002"] },
      priority: { from: 0, to: 4 },
    });
  });

  it("refuse une règle inconnue, et un article retiré du catalogue", async () => {
    const { create, revise } = scene();
    await expect(
      revise.execute(new ReviseStaffSuggestionCommand("nope", croissantInput(TODAY), null)),
    ).rejects.toThrow(SuggestionRuleNotFoundError);
    const id = await create.execute(new CreateStaffSuggestionCommand(croissantInput(TODAY), null));
    await expect(
      revise.execute(
        new ReviseStaffSuggestionCommand(
          id,
          croissantInput(TODAY, { suggestedSkus: ["OLD-1"] }),
          null,
        ),
      ),
    ).rejects.toThrow(UnknownSuggestionCatalogueError);
  });
});

describe("SetStaffSuggestionActiveHandler et ArchiveStaffSuggestionHandler", () => {
  it("coupe, rallume, archive — un fait par geste qui change, rien pour un geste sans effet", async () => {
    const { rules, events, create, setActive, archive } = scene();
    const id = await create.execute(new CreateStaffSuggestionCommand(croissantInput(TODAY), null));

    await setActive.execute(new SetStaffSuggestionActiveCommand(id, true, "staff_1"));
    await setActive.execute(new SetStaffSuggestionActiveCommand(id, false, "staff_1"));
    await setActive.execute(new SetStaffSuggestionActiveCommand(id, true, "staff_1"));
    await archive.execute(new ArchiveStaffSuggestionCommand(id, "staff_1"));

    expect(rules.store.stored(id).archivedAt).toEqual(NOW);
    expect(events.factTypes()).toEqual([
      "staff_suggestion.created",
      "staff_suggestion.deactivated",
      "staff_suggestion.activated",
      "staff_suggestion.archived",
    ]);
    await expect(archive.execute(new ArchiveStaffSuggestionCommand(id, null))).rejects.toThrow(
      SuggestionRuleArchivedError,
    );
  });
});

describe("SetStaffSuggestionOrderHandler", () => {
  function orderScene() {
    const setting = new OrderSetting();
    const events = new RecordingPublisher();
    const handler = new SetStaffSuggestionOrderHandler(
      new OrderReader(setting),
      new OrderWriter(setting),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    return { setting, events, handler };
  }

  it("règle l'ordre, journalise avant → après, et n'écrit rien pour l'ordre en place", async () => {
    const { setting, events, handler } = orderScene();
    await handler.execute(new SetStaffSuggestionOrderCommand("recent", "staff_1"));
    await handler.execute(new SetStaffSuggestionOrderCommand("priority", "staff_1"));

    expect(setting.puts).toEqual([{ order: "priority", stamp: { by: "staff_1", at: NOW } }]);
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { order: { from: "recent", to: "priority" } },
    ]);
  });

  it("refuse un ordre inconnu", async () => {
    const { handler } = orderScene();
    await expect(
      handler.execute(new SetStaffSuggestionOrderCommand("random", null)),
    ).rejects.toThrow(UnknownSuggestionOrderError);
  });
});
