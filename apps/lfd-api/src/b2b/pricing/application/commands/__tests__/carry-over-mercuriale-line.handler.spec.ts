/**
 * **Reporter une mercuriale sur la référence détachée**
 * (`plan-tarif-date-sur-une-reference.md`, § 6, T5) : la garde de filiation
 * et la vente aux pros AVANT toute écriture, verrou et relecture dans
 * l'unité de travail, avenant marqué de son origine, acte `amended`.
 *
 * Ports doublés par de vraies sous-classes. Les dates ne sont comparées
 * qu'à l'horloge figée de la fixture.
 */
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import {
  CarriedMercurialeNotFoundError,
  NotDetachedFromError,
  SaleReferenceNotOnSaleError,
} from "../../../domain/pricing-errors.js";
import { InMemorySaleReferenceLineage } from "../../../infrastructure/in-memory-sale-reference-lineage.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { CarryOverMercurialeLineCommand } from "../carry-over-mercuriale-line.command.js";
import { CarryOverMercurialeLineHandler } from "../carry-over-mercuriale-line.handler.js";
import {
  LockingMercuriales,
  TracingUnitOfWork,
  type Trace,
} from "./mercuriale-amendment.doubles.js";
import { InMemoryReservedElsewhere } from "../../../infrastructure/in-memory-reserved-elsewhere.js";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const OLD_SKU = "CHO-000-2";
const NEW_SKU = "CHO-001";
const REASON = `Report de la déclinaison détachée ${OLD_SKU}`;

const JUNE = new Date("2026-06-01T00:00:00.000Z");

const stored = (): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: OLD_SKU, tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T00:00:00.000Z"),
    },
    "staff|marie",
  );

function setup(
  options: {
    origins?: Readonly<Record<string, string>>;
    onSale?: readonly string[];
    mercuriale?: CompanyMercuriale | null;
  } = {},
) {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const mercuriales = new LockingMercuriales(
    trace,
    uow,
    options.mercuriale === undefined ? stored() : options.mercuriale,
  );
  const handler = new CarryOverMercurialeLineHandler(
    mercuriales,
    new InMemorySaleReferenceLineage(options.origins ?? { [NEW_SKU]: OLD_SKU }),
    new InMemorySaleReferences(options.onSale ?? [NEW_SKU]),
    new FixedIdGenerator("amd"),
    new FixedClock(NOW),
    uow,
    new InMemoryReservedElsewhere(),
  );
  return { trace, mercuriales, handler };
}

const command = (toSku = NEW_SKU): CarryOverMercurialeLineCommand =>
  new CarryOverMercurialeLineCommand("merc_1", OLD_SKU, toSku, REASON, "staff|paul");

describe("CarryOverMercurialeLineHandler", () => {
  it("écrit, sous verrou, un avenant qui dit d'où il vient, et son acte sur le document", async () => {
    const { trace, mercuriales, handler } = setup();

    const amendmentId = await handler.execute(command());

    expect(trace).toEqual(["begin", "lock+load (in tx)", "write (in tx)", "end"]);
    const [written] = mercuriales.written;
    expect(written?.amendmentId).toBe(amendmentId);
    expect(written?.mercuriale.amendments.at(-1)).toMatchObject({
      lines: [{ sku: NEW_SKU }],
      validFrom: NOW,
      origin: { kind: "detached", fromSku: OLD_SKU, fromMercurialeId: "merc_1" },
    });
    expect(written?.act).toMatchObject({
      subjectType: "mercuriale",
      subjectId: "merc_1",
      kind: "amended",
      at: NOW,
      reason: REASON,
    });
    expect(written?.act.summary).toContain(`+ ${NEW_SKU} reporté depuis ${OLD_SKU}`);
  });

  it("borne le report à l'arrêt de l'ancienne ligne posé par avenant", async () => {
    const ending = stored().amend(
      "amd_end",
      {
        lines: [],
        endedSkus: [OLD_SKU],
        validFrom: JUNE,
        validTo: null,
        reason: "Fin du prix en juin",
        origin: null,
      },
      "staff|paul",
      NOW,
    );
    const { mercuriales, handler } = setup({ mercuriale: ending });

    await handler.execute(command());

    expect(mercuriales.written[0]?.mercuriale.amendments.at(-1)).toMatchObject({
      lines: [{ sku: NEW_SKU }],
      validFrom: NOW,
      validTo: JUNE,
    });
  });

  it("refuse une référence qui n'est pas née de l'ancienne, sans rien ouvrir", async () => {
    const { trace, handler } = setup({ origins: { [NEW_SKU]: "AUTRE-001" } });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(NotDetachedFromError);
    expect(trace).toEqual([]);
  });

  it("refuse une référence sans filiation connue au commerce", async () => {
    const { handler } = setup({ origins: {} });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(NotDetachedFromError);
  });

  it("refuse une nouvelle référence qui ne se vend pas aux pros", async () => {
    const { trace, handler } = setup({ onSale: [] });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(SaleReferenceNotOnSaleError);
    expect(trace).toEqual([]);
  });

  it("refuse une mercuriale introuvable, sans rien écrire", async () => {
    const { mercuriales, handler } = setup({ mercuriale: null });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(CarriedMercurialeNotFoundError);
    expect(mercuriales.written).toEqual([]);
  });
});
