import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { createdBreakfast, LATER } from "../../../domain/entities/__tests__/bundle-fixtures.js";
import {
  BundleAlreadyWithdrawnError,
  BundleChoiceNotServedToPublicError,
  BundleNotFoundError,
  BundleWithdrawnError,
  DuplicateBundleChoiceError,
} from "../../../domain/errors/bundle-errors.js";
import { EditBundlePresentationCommand } from "../edit-bundle-presentation.command.js";
import { EditBundlePresentationHandler } from "../edit-bundle-presentation.handler.js";
import { ReturnBundleToDraftCommand } from "../return-bundle-to-draft.command.js";
import { ReturnBundleToDraftHandler } from "../return-bundle-to-draft.handler.js";
import { SaveBundleCompositionCommand } from "../save-bundle-composition.command.js";
import { SaveBundleCompositionHandler } from "../save-bundle-composition.handler.js";
import { WithdrawBundleCommand } from "../withdraw-bundle.command.js";
import { WithdrawBundleHandler } from "../withdraw-bundle.handler.js";
import {
  article,
  BREAKFAST_ARTICLES,
  FixedChoiceCatalogue,
  InMemoryBundles,
} from "./bundle-doubles.js";

const KEY = "petit-dejeuner";

function scene(articles = BREAKFAST_ARTICLES) {
  const bundles = new InMemoryBundles([createdBreakfast()]);
  const events = new RecordingPublisher();
  const catalogue = new FixedChoiceCatalogue(articles);
  const clock = new FixedClock(LATER);
  const uow = new DirectUnitOfWork();
  const ports = [bundles, clock, events, uow] as const;
  const compose = new SaveBundleCompositionHandler(bundles, catalogue, clock, events, uow);
  return { bundles, events, catalogue, ports, compose };
}

/** La composition du petit déjeuner, telle que l'écran la renverrait. */
function currentGroups(bundles: InMemoryBundles) {
  return bundles.stored(KEY).groups.map((group) => ({ ...group }));
}

describe("EditBundlePresentationHandler", () => {
  it("renomme et décrit, journalise le diff seul, et ne dit rien d'un geste sans effet", async () => {
    const { bundles, events, ports } = scene();
    const handler = new EditBundlePresentationHandler(...ports);
    const edit = (name: string) =>
      handler.execute(
        new EditBundlePresentationCommand(
          KEY,
          { name, description: "Une douceur, une baguette, une boisson." },
          "staff_2",
        ),
      );

    await edit("Petit déjeuner");
    await edit("Le petit déjeuner");

    expect(bundles.saves).toBe(1);
    expect(bundles.stored(KEY)).toMatchObject({ key: KEY, name: "Le petit déjeuner" });
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      {
        subjectLabel: "Le petit déjeuner",
        changes: { name: { from: "Petit déjeuner", to: "Le petit déjeuner" } },
      },
    ]);
  });

  it("refuse une formule inconnue", async () => {
    const { ports } = scene();

    await expect(
      new EditBundlePresentationHandler(...ports).execute(
        new EditBundlePresentationCommand("fantome", { name: "x", description: null }, null),
      ),
    ).rejects.toThrow(BundleNotFoundError);
  });
});

describe("SaveBundleCompositionHandler", () => {
  it("enregistre la composition, ne fait admettre que les articles ajoutés, journalise avant → après", async () => {
    const { bundles, events, catalogue, compose } = scene([
      ...BREAKFAST_ARTICLES,
      article("FRU-001-1"),
    ]);
    const groups = [
      ...currentGroups(bundles),
      { key: null, label: "Fruit", choices: ["FRU-001-1"] },
    ];

    await compose.execute(new SaveBundleCompositionCommand(KEY, groups, "staff_2"));

    expect(catalogue.asked).toEqual([["FRU-001-1"]]);
    expect(bundles.stored(KEY).groups.map((group) => group.key)).toEqual([
      "douceur",
      "baguette",
      "boisson",
      "fruit",
    ]);
    expect(events.factTypes()).toEqual(["bundle.composition_saved"]);
  });

  /** Un article masqué DEPUIS qu'il est dans la formule ne bloque pas les autres gestes. */
  it("ne rejuge pas un article déjà dans la formule", async () => {
    const hidden = BREAKFAST_ARTICLES.map((entry) =>
      entry.sku === "PAI-001-1" ? article("PAI-001-1", "not_served_to_public") : entry,
    );
    const { bundles, compose } = scene(hidden);
    const groups = currentGroups(bundles).reverse();

    await compose.execute(new SaveBundleCompositionCommand(KEY, groups, "staff_2"));

    expect(bundles.stored(KEY).groups[0]?.key).toBe("boisson");
  });

  it("refuse un article ajouté qui n'est pas servi au public, sans rien écrire", async () => {
    const { bundles, events, compose } = scene([
      ...BREAKFAST_ARTICLES,
      article("PRO-1", "not_served_to_public"),
    ]);
    const groups = [...currentGroups(bundles), { key: null, label: "Pro", choices: ["PRO-1"] }];

    await expect(
      compose.execute(new SaveBundleCompositionCommand(KEY, groups, "staff_2")),
    ).rejects.toThrow(BundleChoiceNotServedToPublicError);
    expect(bundles.saves).toBe(0);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse un article en double", async () => {
    const { bundles, compose } = scene();
    const groups = [
      ...currentGroups(bundles),
      { key: null, label: "Encore", choices: ["BOI-001-1"] },
    ];

    await expect(
      compose.execute(new SaveBundleCompositionCommand(KEY, groups, "staff_2")),
    ).rejects.toThrow(DuplicateBundleChoiceError);
  });

  it("n'écrit rien quand la composition ne change pas", async () => {
    const { bundles, events, compose } = scene();

    await compose.execute(new SaveBundleCompositionCommand(KEY, currentGroups(bundles), "staff_2"));

    expect(bundles.saves).toBe(0);
    expect(events.traced).toHaveLength(0);
  });
});

describe("WithdrawBundleHandler et ReturnBundleToDraftHandler", () => {
  it("retire puis remet en brouillon, un fait par geste", async () => {
    const { bundles, events, ports } = scene();

    await new WithdrawBundleHandler(...ports).execute(new WithdrawBundleCommand(KEY, "staff_2"));
    expect(bundles.stored(KEY)).toMatchObject({ status: "withdrawn", writtenAt: LATER });
    await new ReturnBundleToDraftHandler(...ports).execute(
      new ReturnBundleToDraftCommand(KEY, "staff_2"),
    );

    expect(bundles.stored(KEY).status).toBe("draft");
    expect(events.factTypes()).toEqual(["bundle.withdrawn", "bundle.returned_to_draft"]);
  });

  it("refuse de retirer deux fois, et de composer une formule retirée", async () => {
    const { bundles, ports, compose } = scene();
    const withdraw = new WithdrawBundleHandler(...ports);
    await withdraw.execute(new WithdrawBundleCommand(KEY, "staff_2"));

    await expect(withdraw.execute(new WithdrawBundleCommand(KEY, "staff_2"))).rejects.toThrow(
      BundleAlreadyWithdrawnError,
    );
    await expect(
      compose.execute(new SaveBundleCompositionCommand(KEY, currentGroups(bundles), "staff_2")),
    ).rejects.toThrow(BundleWithdrawnError);
  });
});
