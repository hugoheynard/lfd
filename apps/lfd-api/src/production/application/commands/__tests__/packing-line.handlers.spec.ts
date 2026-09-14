import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay, type PackedLineMark } from "../../../domain/entities/production-day.js";
import {
  AtelierSheetNotFoundError,
  LineNotProducedYetError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
  ProductionDayNotClosedError,
} from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { MarkPackingLineCommand } from "../mark-packing-line.command.js";
import { MarkPackingLineHandler } from "../mark-packing-line.handler.js";
import { UnmarkPackingLineCommand } from "../unmark-packing-line.command.js";
import { UnmarkPackingLineHandler } from "../unmark-packing-line.handler.js";

/** Aucune comparaison à l'horloge ici : cet instant n'est que recopié. */
const NOW = new Date("2026-09-13T05:10:00.000Z");
const DAY = "2026-09-13";
const REFERENCE = "CMD-0001";
const SKU = "VIE-001";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: REFERENCE,
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  lines: [{ sku: SKU, productName: "Croissant", quantity: 12 }],
};

/** Le dépôt doublé : il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Days extends ProductionDayRepository {
  readonly marks: { reference: string; sku: string; mark: PackedLineMark | null }[] = [];
  saved = 0;

  constructor(private readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    this.saved += 1;
    return Promise.resolve();
  }

  /** Non utilisés par le poste de colisage : rejeter plutôt que rendre muet. */
  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markProduced(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPackedLine(
    _day: ServiceDay,
    reference: string,
    sku: string,
    mark: PackedLineMark | null,
  ): Promise<void> {
    this.marks.push({ reference, sku, mark });
    return Promise.resolve();
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/**
 * Une journée arrêtée, dont l'article est **déjà sorti du four**.
 *
 * La coche d'atelier passe par `fromSnapshot` et non par une méthode : elle
 * s'écrit en ciblé côté adaptateur, l'agrégat ne la pose jamais lui-même. C'est
 * exactement ce que le dépôt rehydrate au chargement.
 */
function closedDay(): ProductionDay {
  const snapshot = awaitingDay().toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    counts: snapshot.counts.map((item) => ({
      ...item,
      done: { at: new Date("2026-09-13T04:40:00.000Z"), by: "auth0|karim", initials: "KA" },
    })),
  });
}

/** La même, mais rien n'est encore sorti du four. */
function awaitingDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Date("2026-09-13T04:20:00.000Z"));
  return day;
}

/** La même, bac FERMÉ : le fait irréversible est déjà posé. */
function sealedDay(): ProductionDay {
  const day = closedDay();
  day.pack(REFERENCE, new Date("2026-09-13T04:50:00.000Z"), "auth0|karim");
  return day;
}

describe("MarkPackingLineHandler", () => {
  it("grave la ligne avec l'instant de l'HORLOGE et l'identité du guard", async () => {
    const days = new Days(closedDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1"));

    expect(days.marks).toHaveLength(1);
    expect(days.marks[0]).toEqual({
      reference: REFERENCE,
      sku: SKU,
      mark: { at: NOW, by: "staff-1", initials: "MB" },
    });
  });

  it("n'écrit PAS la journée entière : la coche est une écriture ciblée", async () => {
    // Deux postes colisent deux bacs différents en même temps ; un `save` de
    // l'agrégat réécrirait la journée et viderait le bac du voisin.
    const days = new Days(closedDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1"));

    expect(days.saved).toBe(0);
  });

  it("laisse passer des initiales VIDES — on coche d'abord, on signe si on veut", async () => {
    const days = new Days(closedDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "", "staff-1"));

    expect(days.marks[0]?.mark).toMatchObject({ initials: "" });
  });

  it("refuse une journée qui n'est pas arrêtée, sans rien écrire", async () => {
    const days = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
    expect(days.marks).toHaveLength(0);
  });

  it("refuse une référence hors du plan du jour, sans rien écrire", async () => {
    const days = new Days(closedDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, "CMD-9999", SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(AtelierSheetNotFoundError);
    expect(days.marks).toHaveLength(0);
  });

  it("refuse un SKU qui n'est pas sur ce bon, sans rien écrire", async () => {
    const days = new Days(closedDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, "PAI-001", "MB", "staff-1")),
    ).rejects.toBeInstanceOf(PackingLineNotFoundError);
    expect(days.marks).toHaveLength(0);
  });

  it("🔴 refuse un bac FERMÉ, sans rien écrire", async () => {
    // Le contenu a été annoncé au commerce, qui en a tiré « prête pour le
    // client » : le modifier après coup ferait mentir l'annonce.
    const days = new Days(sealedDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(PackedOrderSealedError);
    expect(days.marks).toHaveLength(0);
  });
});

describe("l'article pas encore sorti du four", () => {
  it("🔴 REFUSE de mettre au bac ce que le four n'a pas sorti", async () => {
    // Sans ce refus, la balance compterait comme réparti ce qui n'existe pas,
    // et le reste affiché serait faux dans le seul sens qui coûte — optimiste.
    const days = new Days(awaitingDay());
    const handler = new MarkPackingLineHandler(days, new FixedClock(NOW));

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(LineNotProducedYetError);
    expect(days.marks).toHaveLength(0);
  });

  it("laisse pourtant RESSORTIR une ligne déjà au bac", async () => {
    // Le fournil a repris sa coche d'atelier après coup. Refuser les deux sens
    // enfermerait l'exploitant avec un bac qu'il ne peut ni compléter ni
    // corriger.
    const days = new Days(awaitingDay());

    await new UnmarkPackingLineHandler(days).execute(
      new UnmarkPackingLineCommand(DAY, REFERENCE, SKU),
    );

    expect(days.marks).toEqual([{ reference: REFERENCE, sku: SKU, mark: null }]);
  });
});

describe("UnmarkPackingLineHandler", () => {
  it("ressort la ligne du bac — le geste est autorisé tant qu'il est ouvert", async () => {
    const days = new Days(closedDay());

    await new UnmarkPackingLineHandler(days).execute(
      new UnmarkPackingLineCommand(DAY, REFERENCE, SKU),
    );

    expect(days.marks).toEqual([{ reference: REFERENCE, sku: SKU, mark: null }]);
  });

  it("porte les mêmes quatre refus que la coche", async () => {
    const open = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(
      new UnmarkPackingLineHandler(open).execute(new UnmarkPackingLineCommand(DAY, REFERENCE, SKU)),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);

    const unknownSheet = new Days(closedDay());
    await expect(
      new UnmarkPackingLineHandler(unknownSheet).execute(
        new UnmarkPackingLineCommand(DAY, "CMD-9999", SKU),
      ),
    ).rejects.toBeInstanceOf(AtelierSheetNotFoundError);

    const unknownLine = new Days(closedDay());
    await expect(
      new UnmarkPackingLineHandler(unknownLine).execute(
        new UnmarkPackingLineCommand(DAY, REFERENCE, "PAI-001"),
      ),
    ).rejects.toBeInstanceOf(PackingLineNotFoundError);

    const sealed = new Days(sealedDay());
    await expect(
      new UnmarkPackingLineHandler(sealed).execute(
        new UnmarkPackingLineCommand(DAY, REFERENCE, SKU),
      ),
    ).rejects.toBeInstanceOf(PackedOrderSealedError);
    expect(sealed.marks).toHaveLength(0);
  });
});
