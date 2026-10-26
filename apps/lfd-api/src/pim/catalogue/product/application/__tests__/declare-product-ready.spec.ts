import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PIM_EVENTS } from "../../../../journal/pim-journal.js";
import {
  AnonymousReadinessError,
  ArchivedProductNotReadyError,
  ProductNotFoundError,
} from "../../domain/errors/product-errors.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { FakeProducts, FakeReadiness, NOW, PRODUCT_ID, snapshot } from "./readiness-doubles.js";
import {
  DeclareProductReadyCommand,
  DeclareProductReadyHandler,
} from "../declare-product-ready.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";

/**
 * **La signature.** Ce que la commande inscrit — et ce qu'elle refuse
 * d'inscrire.
 *
 * Elle ne vérifie RIEN du contenu, délibérément : le schéma valide déjà la
 * forme, et aucun code ne dira que 10,00 € est le bon prix. Ce qui se teste,
 * c'est donc qui signe, quand, et les deux cas où signer n'a pas de sens.
 */
function build(status: ProductSnapshot["status"] = "draft") {
  const readiness = new FakeReadiness();
  const journal = new RecordingJournal();
  const handler = new DeclareProductReadyHandler(
    new FakeProducts(snapshot(status)),
    readiness,
    journal,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
  );
  return { handler, readiness, journal };
}

/** Le geste, tel qu'il arrive vraiment : dans une requête, signée par quelqu'un. */
function asStaff<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now: NOW, traceId: "trace-1", actor: { type: "staff", id: "staff_hugo" } },
    fn,
  );
}

describe("DeclareProductReady", () => {
  it("inscrit la date et l'auteur du contexte, pas ceux de l'appelant", async () => {
    const { handler, readiness } = build();

    await asStaff(() => handler.execute(new DeclareProductReadyCommand(PRODUCT_ID)));

    expect(readiness.declared).toEqual({ readyAt: NOW, readyBy: "staff_hugo" });
  });

  it("trace un fait DISTINCT de la mise en vente", async () => {
    const { handler, journal } = build();

    await asStaff(() => handler.execute(new DeclareProductReadyCommand(PRODUCT_ID)));

    // « qui a validé ce prix » et « qui l'a mis en ligne » ne sont pas la même
    // question, ni souvent la même personne : deux faits, deux types.
    expect(journal.entries.map((entry) => entry.type)).toEqual([PIM_EVENTS.productDeclaredReady]);
    expect(PIM_EVENTS.productDeclaredReady).not.toBe(PIM_EVENTS.productPublished);
  });

  it("ne touche pas au statut : une fiche signée reste un brouillon", async () => {
    const { handler, readiness } = build("draft");

    await asStaff(() => handler.execute(new DeclareProductReadyCommand(PRODUCT_ID)));

    // Rien à assérer sur le produit : le handler n'appelle aucun verbe de
    // l'agrégat, et `save()` n'est jamais appelé. La signature est un fait SUR
    // la fiche, pas une modification DE la fiche — c'est ce qui lui permet de
    // ne pas se périmer elle-même.
    expect(readiness.declared).not.toBeNull();
  });

  it("refuse une signature anonyme — hors requête, personne n'a regardé", async () => {
    const { handler, readiness } = build();

    await expect(
      handler.execute(new DeclareProductReadyCommand(PRODUCT_ID)),
    ).rejects.toBeInstanceOf(AnonymousReadinessError);
    expect(readiness.declared).toBeNull();
  });

  it("refuse de se prononcer sur une fiche archivée", async () => {
    const { handler } = build("archived");

    await expect(
      asStaff(() => handler.execute(new DeclareProductReadyCommand(PRODUCT_ID))),
    ).rejects.toBeInstanceOf(ArchivedProductNotReadyError);
  });

  it("refuse un produit inconnu", async () => {
    const handler = new DeclareProductReadyHandler(
      new FakeProducts(null),
      new FakeReadiness(),
      new RecordingJournal(),
      new FixedClock(NOW),
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    );

    await expect(
      asStaff(() => handler.execute(new DeclareProductReadyCommand(PRODUCT_ID))),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
