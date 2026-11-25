import { Backorder } from "../../domain/entities/backorder.js";
import { BackorderAbandonNeedsStaffError } from "../../domain/errors/backorder-errors.js";
import { BackorderLine } from "../../domain/value-objects/backorder-line.js";
import { backorderAbandonmentScene } from "./backorder-abandonment-doubles.js";

/**
 * L'origine annulée abandonne son reliquat ouvert (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5).
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge. */
const NOW = new Date(0);
const ORIGIN = { orderId: "ord_1", orderNumber: "ORD-1" };

function openBackorder(): Backorder {
  return Backorder.open({
    id: "bo_1",
    originOrderId: "ord_1",
    companyId: "co_1",
    buyerUserId: "usr_1",
    lines: [BackorderLine.of({ sku: "CRO", quantity: 4, saleUnit: "piece" })],
    openedAt: NOW,
  });
}

describe("BackorderAbandonment.abandonOnOriginCancelled", () => {
  it("abandonne le reliquat ouvert au nom de l'équipe, et le journalise", async () => {
    const { abandonment, backorders, journal } = backorderAbandonmentScene([openBackorder()], NOW);

    await abandonment.abandonOnOriginCancelled(ORIGIN, "fiche-marie");

    expect(backorders.stateOf("bo_1")).toMatchObject({
      state: "abandoned",
      closedByStaffId: "fiche-marie",
    });
    expect(journal.facts[0]).toMatchObject({
      type: "backorder.abandoned",
      payload: { subjectLabel: "ORD-1" },
    });
  });

  it("ne touche ni un reliquat transformé, ni un reliquat déjà abandonné", async () => {
    const converted = openBackorder();
    converted.convert("ord_2", NOW, "fiche-paul");
    const { abandonment, backorders, journal } = backorderAbandonmentScene([converted], NOW);

    await abandonment.abandonOnOriginCancelled(ORIGIN, "fiche-marie");

    expect(backorders.saved).toEqual([]);
    expect(journal.types()).toEqual([]);
  });

  it("une commande sans reliquat : rien", async () => {
    const { abandonment, backorders } = backorderAbandonmentScene([], NOW);

    await abandonment.abandonOnOriginCancelled(ORIGIN, null);

    expect(backorders.saved).toEqual([]);
  });

  it("un client qui annule une origine au reliquat ouvert est refusé : l'abandon nomme l'équipe", async () => {
    const { abandonment, backorders } = backorderAbandonmentScene([openBackorder()], NOW);

    await expect(abandonment.abandonOnOriginCancelled(ORIGIN, null)).rejects.toBeInstanceOf(
      BackorderAbandonNeedsStaffError,
    );
    expect(backorders.stateOf("bo_1")?.state).toBe("open");
  });

  it("ne touche pas un reliquat déjà abandonné, et n'exige pas l'équipe pour le constater", async () => {
    const abandoned = openBackorder();
    abandoned.abandon(NOW, "fiche-paul");
    const { abandonment, backorders, journal } = backorderAbandonmentScene([abandoned], NOW);

    // Un client qui annule : rien à abandonner, donc rien à refuser.
    await abandonment.abandonOnOriginCancelled(ORIGIN, null);

    expect(backorders.saved).toEqual([]);
    expect(journal.types()).toEqual([]);
    expect(backorders.stateOf("bo_1")).toMatchObject({ closedByStaffId: "fiche-paul" });
  });

  it("un client qui annule l'origine d'un reliquat transformé n'est pas refusé", async () => {
    const converted = openBackorder();
    converted.convert("ord_2", NOW, "fiche-paul");
    const { abandonment, backorders } = backorderAbandonmentScene([converted], NOW);

    await abandonment.abandonOnOriginCancelled(ORIGIN, null);

    expect(backorders.stateOf("bo_1")).toMatchObject({
      state: "converted",
      convertedOrderId: "ord_2",
    });
  });

  it("le refus d'un client n'écrit rien et ne trace rien", async () => {
    const { abandonment, backorders, journal } = backorderAbandonmentScene([openBackorder()], NOW);

    await expect(abandonment.abandonOnOriginCancelled(ORIGIN, null)).rejects.toBeInstanceOf(
      BackorderAbandonNeedsStaffError,
    );

    expect(backorders.saved).toEqual([]);
    expect(journal.types()).toEqual([]);
  });

  it("l'annulation d'une origine ne ferme que le reliquat de CETTE origine", async () => {
    const neighbour = Backorder.open({
      id: "bo_2",
      originOrderId: "ord_2",
      companyId: "co_2",
      buyerUserId: "usr_2",
      lines: [BackorderLine.of({ sku: "CRO", quantity: 1, saleUnit: "piece" })],
      openedAt: NOW,
    });
    const { abandonment, backorders } = backorderAbandonmentScene(
      [openBackorder(), neighbour],
      NOW,
    );

    await abandonment.abandonOnOriginCancelled(ORIGIN, "fiche-marie");

    expect(backorders.stateOf("bo_1")?.state).toBe("abandoned");
    expect(backorders.stateOf("bo_2")?.state).toBe("open");
  });

  it("verrouille par l'origine, écrit, puis seulement journalise", async () => {
    const trace: string[] = [];
    const { abandonment } = backorderAbandonmentScene([openBackorder()], NOW, trace);

    await abandonment.abandonOnOriginCancelled(ORIGIN, "fiche-marie");

    expect(trace).toEqual(["lock-backorder-by-origin", "save-backorder"]);
  });
});
