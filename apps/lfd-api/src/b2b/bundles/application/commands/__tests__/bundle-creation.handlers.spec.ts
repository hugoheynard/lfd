import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  breakfast,
  CREATED_AT,
  createdBreakfast,
} from "../../../domain/entities/__tests__/bundle-fixtures.js";
import {
  BundleChoiceNotServedToPublicError,
  BundleChoiceOperationOnlyError,
  BundleKeyTakenError,
  BundleTooFewGroupsError,
  UnknownBundleChoicesError,
} from "../../../domain/errors/bundle-errors.js";
import { CreateBundleCommand } from "../create-bundle.command.js";
import { CreateBundleHandler } from "../create-bundle.handler.js";
import {
  article,
  BREAKFAST_ARTICLES,
  FixedChoiceCatalogue,
  InMemoryBundles,
} from "./bundle-doubles.js";

function scene(articles = BREAKFAST_ARTICLES, seed = [] as ReturnType<typeof createdBreakfast>[]) {
  const bundles = new InMemoryBundles(seed);
  const events = new RecordingPublisher();
  const handler = new CreateBundleHandler(
    bundles,
    new FixedChoiceCatalogue(articles),
    new FixedIdGenerator("bundle"),
    new FixedClock(CREATED_AT),
    events,
    new DirectUnitOfWork(),
  );
  const { name, description, groups } = breakfast();
  const create = (over: Partial<CreateBundleCommand["bundle"]> = {}) =>
    handler.execute(new CreateBundleCommand({ name, description, groups, ...over }, "staff_1"));
  return { bundles, events, create };
}

describe("CreateBundleHandler", () => {
  it("crée en brouillon pour le public, rend la clé, et journalise la naissance", async () => {
    const { bundles, events, create } = scene();

    await expect(create()).resolves.toBe("petit-dejeuner");

    expect(bundles.stored("petit-dejeuner")).toMatchObject({
      id: "bundle_000001",
      status: "draft",
      audience: "public",
      writtenBy: "staff_1",
    });
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "bundle.created",
      subjectType: "bundle",
      subjectId: "petit-dejeuner",
      payload: { subjectLabel: "Petit déjeuner", audience: "public" },
    });
  });

  it.each([
    ["inconnu", [], UnknownBundleChoicesError],
    [
      "pas servi au public",
      [article("VIE-001-1", "not_served_to_public")],
      BundleChoiceNotServedToPublicError,
    ],
    [
      "réservé aux opérations",
      [article("VIE-001-1", "operation_only")],
      BundleChoiceOperationOnlyError,
    ],
  ] as const)("refuse un article %s, sans rien écrire", async (_case, odd, refusal) => {
    const others = BREAKFAST_ARTICLES.filter((entry) => entry.sku !== "VIE-001-1");
    const { bundles, events, create } = scene([...others, ...odd]);

    await expect(create()).rejects.toThrow(refusal);
    expect(bundles.adds).toBe(0);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse une composition d'un seul groupe avant de lire le catalogue", async () => {
    const { create } = scene();

    await expect(create({ groups: breakfast().groups.slice(0, 1) })).rejects.toThrow(
      BundleTooFewGroupsError,
    );
  });

  /** Une clé ne se réemploie jamais, retirée comprise. */
  it("refuse un nom dont la clé est déjà prise", async () => {
    const { bundles, create } = scene(BREAKFAST_ARTICLES, [createdBreakfast()]);

    await expect(create({ name: "Petit-déjeuner" })).rejects.toThrow(BundleKeyTakenError);
    expect(bundles.adds).toBe(0);
  });
});
