import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingDayLock } from "../../../application/__tests__/batch-doubles.js";
import { legacyOf, RecordingStation } from "../../../application/__tests__/station-doubles.js";
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
  dueAt: null,
  lines: [{ sku: SKU, productName: "Croissant", quantity: 12 }],
};

/** Le dépôt doublé : il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Days extends ProductionDayRepository {
  readonly marks: { reference: string; sku: string; mark: PackedLineMark | null }[] = [];
  saved = 0;

  constructor(
    private readonly current: ProductionDay,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
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

  stepContainerCount(): Promise<boolean> {
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
  return legacyOf(day);
}

/** La même, arrêtée par le binaire de K2 : colisée au colisage. */
function packingDay(): ProductionDay {
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

function markHandler(
  days: Days,
  lock = new RecordingDayLock(),
  station = new RecordingStation(),
): MarkPackingLineHandler {
  return new MarkPackingLineHandler(
    days,
    lock,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    station,
  );
}

function unmarkHandler(
  days: Days,
  lock = new RecordingDayLock(),
  station = new RecordingStation(),
): UnmarkPackingLineHandler {
  return new UnmarkPackingLineHandler(days, lock, new DirectUnitOfWork(), station);
}

describe("le verrou de la journée (D4 des fournées)", () => {
  it("🔴 mettre au bac verrouille la journée AVANT de la relire", async () => {
    // Deux postes, 12 disponibles, deux lignes de 12 : sans verrou pris avant
    // la relecture, chacun lirait 12 et les deux passeraient.
    const trace: string[] = [];
    const days = new Days(closedDay(), trace);

    await markHandler(days, new RecordingDayLock(trace)).execute(
      new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1"),
    );

    expect(trace).toEqual([`lock:${DAY}`, "load"]);
  });

  it("ressortir du bac aussi — un retirage concurrent réécrit le colisage", async () => {
    const trace: string[] = [];
    const days = new Days(closedDay(), trace);

    await unmarkHandler(days, new RecordingDayLock(trace)).execute(
      new UnmarkPackingLineCommand(DAY, REFERENCE, SKU),
    );

    expect(trace).toEqual([`lock:${DAY}`, "load"]);
  });
});

describe("MarkPackingLineHandler", () => {
  it("grave la ligne avec l'instant de l'HORLOGE et l'identité du guard", async () => {
    const days = new Days(closedDay());
    const handler = markHandler(days);

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
    const handler = markHandler(days);

    await handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1"));

    expect(days.saved).toBe(0);
  });

  it("laisse passer des initiales VIDES — on coche d'abord, on signe si on veut", async () => {
    const days = new Days(closedDay());
    const handler = markHandler(days);

    await handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "", "staff-1"));

    expect(days.marks[0]?.mark).toMatchObject({ initials: "" });
  });

  it("refuse une journée qui n'est pas arrêtée, sans rien écrire", async () => {
    const days = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    const handler = markHandler(days);

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
    expect(days.marks).toHaveLength(0);
  });

  it("refuse une référence hors du plan du jour, sans rien écrire", async () => {
    const days = new Days(closedDay());
    const handler = markHandler(days);

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, "CMD-9999", SKU, "MB", "staff-1")),
    ).rejects.toBeInstanceOf(AtelierSheetNotFoundError);
    expect(days.marks).toHaveLength(0);
  });

  it("refuse un SKU qui n'est pas sur ce bon, sans rien écrire", async () => {
    const days = new Days(closedDay());
    const handler = markHandler(days);

    await expect(
      handler.execute(new MarkPackingLineCommand(DAY, REFERENCE, "PAI-001", "MB", "staff-1")),
    ).rejects.toBeInstanceOf(PackingLineNotFoundError);
    expect(days.marks).toHaveLength(0);
  });

  it("🔴 refuse un bac FERMÉ, sans rien écrire", async () => {
    // Le contenu a été annoncé au commerce, qui en a tiré « prête pour le
    // client » : le modifier après coup ferait mentir l'annonce.
    const days = new Days(sealedDay());
    const handler = markHandler(days);

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
    const handler = markHandler(days);

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

    await unmarkHandler(days).execute(new UnmarkPackingLineCommand(DAY, REFERENCE, SKU));

    expect(days.marks).toEqual([{ reference: REFERENCE, sku: SKU, mark: null }]);
  });
});

describe("UnmarkPackingLineHandler", () => {
  it("ressort la ligne du bac — le geste est autorisé tant qu'il est ouvert", async () => {
    const days = new Days(closedDay());

    await unmarkHandler(days).execute(new UnmarkPackingLineCommand(DAY, REFERENCE, SKU));

    expect(days.marks).toEqual([{ reference: REFERENCE, sku: SKU, mark: null }]);
  });

  it("porte les mêmes quatre refus que la coche", async () => {
    const open = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(
      unmarkHandler(open).execute(new UnmarkPackingLineCommand(DAY, REFERENCE, SKU)),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);

    const unknownSheet = new Days(closedDay());
    await expect(
      unmarkHandler(unknownSheet).execute(new UnmarkPackingLineCommand(DAY, "CMD-9999", SKU)),
    ).rejects.toBeInstanceOf(AtelierSheetNotFoundError);

    const unknownLine = new Days(closedDay());
    await expect(
      unmarkHandler(unknownLine).execute(new UnmarkPackingLineCommand(DAY, REFERENCE, "PAI-001")),
    ).rejects.toBeInstanceOf(PackingLineNotFoundError);

    const sealed = new Days(sealedDay());
    await expect(
      unmarkHandler(sealed).execute(new UnmarkPackingLineCommand(DAY, REFERENCE, SKU)),
    ).rejects.toBeInstanceOf(PackedOrderSealedError);
    expect(sealed.marks).toHaveLength(0);
  });
});

describe("une journée `packing` (colisage, K2)", () => {
  it("remet la mise au bac au poste du colisage, sans rien écrire au fournil", async () => {
    const days = new Days(packingDay());
    const station = new RecordingStation();

    await markHandler(days, new RecordingDayLock(), station).execute(
      new MarkPackingLineCommand(DAY, REFERENCE, SKU, "MB", "staff-1"),
    );

    expect(station.calls).toEqual([`mark:ord_1:${SKU}:staff-1:MB`]);
    expect(days.marks).toEqual([]);
  });

  it("ne juge PAS « pas encore sorti du four » : c'est la réserve du colisage qui le dit", async () => {
    // Rien n'est sorti au fournil ; la remise peut pourtant être arrivée au colisage.
    const station = new RecordingStation();

    await markHandler(new Days(packingDay()), new RecordingDayLock(), station).execute(
      new MarkPackingLineCommand(DAY, REFERENCE, SKU, "", "staff-1"),
    );

    expect(station.calls).toHaveLength(1);
  });

  it("garde les refus STRUCTURELS du fournil : référence hors du plan", async () => {
    const station = new RecordingStation();

    await expect(
      markHandler(new Days(packingDay()), new RecordingDayLock(), station).execute(
        new MarkPackingLineCommand(DAY, "CMD-9999", SKU, "", "staff-1"),
      ),
    ).rejects.toBeInstanceOf(AtelierSheetNotFoundError);
    expect(station.calls).toEqual([]);
  });

  it("remet la décoche au poste du colisage", async () => {
    const days = new Days(packingDay());
    const station = new RecordingStation();

    await unmarkHandler(days, new RecordingDayLock(), station).execute(
      new UnmarkPackingLineCommand(DAY, REFERENCE, SKU),
    );

    expect(station.calls).toEqual([`unmark:ord_1:${SKU}`]);
    expect(days.marks).toEqual([]);
  });
});
