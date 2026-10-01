import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { QualityCheck } from "../../../domain/entities/quality-check.js";
import { QualityCheckNoteRequiredError } from "../../../domain/errors/quality-check-errors.js";
import {
  QualityCheckReplayConflictError,
  QualityLineNotCountedError,
  QualityOrderNotInPlanError,
  QualityOrderNotPackedError,
  QualityUploadAlreadyAttachedError,
  QualityUploadNotFoundError,
  QualityUploadReleasedError,
} from "../../../domain/errors/quality-record-errors.js";
import type { QualityTargetRequest } from "../../../domain/services/quality-check-scope.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  CheckTable,
  closedDay,
  CROISSANT,
  FixedDays,
  FixedOrderCustody,
  InMemoryCheckReader,
  InMemoryChecks,
  InMemoryProductionStore,
  InMemoryUploads,
  JPEG,
} from "../../__tests__/quality-doubles.js";
import { QualityPhotoAttachment } from "../../services/quality-photo-attachment.service.js";
import { DepositQualityPhotoCommand } from "../deposit-quality-photo.command.js";
import { DepositQualityPhotoHandler } from "../deposit-quality-photo.handler.js";
import { RenderQualityCheckCommand } from "../render-quality-check.command.js";
import { RenderQualityCheckHandler } from "../render-quality-check.handler.js";

/**
 * Le verdict du superviseur, ports doublés à la main (lot QC2). La journée de
 * service n'est jamais comparée à l'horloge ici : elle n'est que recopiée.
 */
const DAY = ServiceDay.of("2026-10-01");
const SUPERVISOR = "staff_sup";
const LINE: QualityTargetRequest = { kind: "line", sku: CROISSANT };
const ORDER_2: QualityTargetRequest = { kind: "order", orderId: "ord_2" };

function subject(packed: readonly string[] = ["ord_2"]) {
  const clock = new FixedClock(new Date());
  const table = new CheckTable();
  const checks = new InMemoryChecks(table);
  const uploads = new InMemoryUploads(table);
  const store = new InMemoryProductionStore();
  const events = new RecordingPublisher();
  const days = new FixedDays(closedDay(DAY, clock.now(), packed));
  const attachment = new QualityPhotoAttachment(uploads, store, clock);
  const handler = new RenderQualityCheckHandler(
    checks,
    new InMemoryCheckReader(table),
    days,
    attachment,
    new FixedOrderCustody(),
    events,
    clock,
    new DirectUnitOfWork(),
  );
  const deposit = new DepositQualityPhotoHandler(uploads, store, new FixedIdGenerator("up"), clock);
  return { clock, table, checks, uploads, store, events, handler, deposit };
}

let sequence = 0;
/** Un ULID d'essai, distinct à chaque appel. */
function nextId(): string {
  sequence += 1;
  return `01JQC${String(sequence).padStart(21, "0")}`;
}

function command(
  overrides: Partial<{
    id: string;
    target: QualityTargetRequest;
    verdict: "ok" | "warning" | "blocking";
    note: string | null;
    uploadIds: readonly string[];
    by: string;
  }> = {},
): RenderQualityCheckCommand {
  return new RenderQualityCheckCommand(
    overrides.id ?? nextId(),
    DAY.value,
    overrides.target ?? LINE,
    overrides.verdict ?? "ok",
    overrides.note ?? null,
    overrides.uploadIds ?? [],
    overrides.by ?? SUPERVISOR,
  );
}

describe("RenderQualityCheckHandler — le verdict", () => {
  it("un OK sur une ligne : la quantité vue est lue au COMPTE, et le fait est journalisé", async () => {
    const { handler, table, events } = subject();
    const id = await handler.execute(command());

    const saved = table.rows.get(id);
    expect(saved?.target).toEqual({ kind: "line", sku: CROISSANT, quantitySeen: 16 });
    expect(saved?.checkedBy).toBe(SUPERVISOR);
    expect(events.factTypes()).toEqual(["production_quality.checked"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_quality_check",
      subjectId: id,
      payload: { subjectLabel: CROISSANT, verdict: "ok", photoCount: 0 },
    });
  });

  it.each(["warning", "blocking"] as const)(
    "refuse un verdict %s sans note, avant de toucher au stockage",
    async (verdict) => {
      const { handler, table, store, events } = subject();
      await expect(handler.execute(command({ verdict }))).rejects.toThrow(
        QualityCheckNoteRequiredError,
      );
      expect(table.rows.size).toBe(0);
      expect(store.objects.size).toBe(0);
      expect(events.traced).toEqual([]);
    },
  );

  it("un blocage de LIGNE retient toutes les commandes du plan qui portent le produit (D6, D9)", async () => {
    const { handler, events } = subject();
    await handler.execute(command({ verdict: "blocking", note: "Brûlés" }));

    expect(events.factTypes()).toEqual([
      "production_quality.checked",
      "production_quality.hold_raised",
    ]);
    expect(events.traced[1]?.journalFact().payload).toMatchObject({
      heldOrders: [
        { id: "ord_1", name: "ORD-0001" },
        { id: "ord_2", name: "ORD-0002" },
      ],
    });
  });

  it("un blocage de COMMANDE ne retient qu'elle, et nomme sa référence", async () => {
    const { handler, events } = subject();
    await handler.execute(command({ target: ORDER_2, verdict: "blocking", note: "Bac écrasé" }));

    expect(events.traced[1]?.journalFact().payload).toMatchObject({
      subjectLabel: "ORD-0002",
      target: { kind: "order", order: { id: "ord_2", name: "ORD-0002" } },
      heldOrders: [{ id: "ord_2", name: "ORD-0002" }],
    });
  });

  it("une réserve après un blocage LÈVE la retenue ; un second blocage n'en pose pas une autre", async () => {
    const { handler, events, clock } = subject();
    await handler.execute(command({ verdict: "blocking", note: "Brûlés" }));
    clock.advanceMs(1000);
    await handler.execute(command({ verdict: "blocking", note: "Toujours brûlés" }));
    clock.advanceMs(1000);
    await handler.execute(command({ verdict: "warning", note: "Refaits, dorure pâle" }));

    expect(events.factTypes()).toEqual([
      "production_quality.checked",
      "production_quality.hold_raised",
      "production_quality.checked",
      "production_quality.checked",
      "production_quality.hold_lifted",
    ]);
  });

  it("refuse une ligne hors compte, une commande hors plan, une commande pas colisée", async () => {
    const { handler } = subject(["ord_2"]);
    await expect(
      handler.execute(command({ target: { kind: "line", sku: "XXX-999" } })),
    ).rejects.toThrow(QualityLineNotCountedError);
    await expect(
      handler.execute(command({ target: { kind: "order", orderId: "ord_9" } })),
    ).rejects.toThrow(QualityOrderNotInPlanError);
    await expect(
      handler.execute(command({ target: { kind: "order", orderId: "ord_1" } })),
    ).rejects.toThrow(QualityOrderNotPackedError);
  });
});

describe("RenderQualityCheckHandler — l'idempotence par id (D8)", () => {
  it("un rejeu identique rend le même id sans rien réécrire ni journaliser", async () => {
    const { handler, table, events } = subject();
    const replay = command({ verdict: "warning", note: "Dorure pâle" });
    const first = await handler.execute(replay);
    const again = await handler.execute(replay);

    expect(again).toBe(first);
    expect(table.rows.size).toBe(1);
    expect(events.factTypes()).toEqual(["production_quality.checked"]);
  });

  it("le même id avec un autre contenu est refusé (409)", async () => {
    const { handler } = subject();
    const id = nextId();
    await handler.execute(command({ id, verdict: "warning", note: "Dorure pâle" }));
    await expect(
      handler.execute(command({ id, verdict: "blocking", note: "Dorure pâle" })),
    ).rejects.toThrow(QualityCheckReplayConflictError);
  });

  it("perdre la course contre un rejeu identique rend l'id du gagnant", async () => {
    const { handler, checks, events } = subject();
    const id = nextId();
    checks.raceWinner = QualityCheck.render({
      id,
      serviceDay: DAY,
      target: { kind: "line", sku: CROISSANT, quantitySeen: 16 },
      verdict: "ok",
      note: null,
      checkedBy: SUPERVISOR,
      checkedAt: new Date(),
      photos: [],
    });

    await expect(handler.execute(command({ id }))).resolves.toBe(id);
    expect(events.factTypes()).toEqual([]);
  });
});

describe("RenderQualityCheckHandler — les photos déposées puis rattachées (D8)", () => {
  async function deposited(s: ReturnType<typeof subject>, by = SUPERVISOR): Promise<string> {
    return s.deposit.execute(new DepositQualityPhotoCommand(JPEG, by));
  }

  it("déplace chaque dépôt sous quality/<jour>/<contrôle>/<position> et libère le provisoire", async () => {
    const s = subject();
    const first = await deposited(s);
    const second = await deposited(s);
    const id = await s.handler.execute(
      command({ verdict: "warning", note: "Dorure pâle", uploadIds: [second, first] }),
    );

    expect(s.table.rows.get(id)?.photos).toEqual([
      expect.objectContaining({
        position: 0,
        uploadId: second,
        storageKey: `quality/${DAY.value}/${id}/0`,
      }),
      expect.objectContaining({
        position: 1,
        uploadId: first,
        storageKey: `quality/${DAY.value}/${id}/1`,
      }),
    ]);
    expect([...s.store.objects.keys()].sort()).toEqual([
      `quality/${DAY.value}/${id}/0`,
      `quality/${DAY.value}/${id}/1`,
    ]);
    expect(s.uploads.rows.get(first)?.releasedAt).toEqual(s.clock.now());
    expect(s.events.traced[0]?.journalFact().payload).toMatchObject({ photoCount: 2 });
  });

  it("refuse le dépôt d'une autre personne, comme s'il n'existait pas", async () => {
    const s = subject();
    const theirs = await deposited(s, "staff_other");
    await expect(s.handler.execute(command({ uploadIds: [theirs] }))).rejects.toThrow(
      QualityUploadNotFoundError,
    );
    await expect(s.handler.execute(command({ uploadIds: ["up_inconnu"] }))).rejects.toThrow(
      QualityUploadNotFoundError,
    );
  });

  it("refuse un dépôt déjà rattaché à un autre contrôle", async () => {
    const s = subject();
    const upload = await deposited(s);
    s.store.failOn = "delete";
    await s.handler.execute(command({ uploadIds: [upload] }));
    s.store.failOn = null;
    await expect(s.handler.execute(command({ uploadIds: [upload] }))).rejects.toThrow(
      QualityUploadAlreadyAttachedError,
    );
  });

  it("refuse un dépôt déjà balayé", async () => {
    const s = subject();
    const upload = await deposited(s);
    await s.uploads.markReleased([upload], s.clock.now());
    await expect(s.handler.execute(command({ uploadIds: [upload] }))).rejects.toThrow(
      QualityUploadReleasedError,
    );
  });

  it("une libération en panne ne défait pas le verdict : le provisoire attend le balayage", async () => {
    const s = subject();
    const upload = await deposited(s);
    s.store.failOn = "delete";
    const id = await s.handler.execute(command({ uploadIds: [upload] }));

    expect(s.table.rows.has(id)).toBe(true);
    expect(s.store.objects.has(`quality/pending/${upload}`)).toBe(true);
    expect(s.uploads.rows.get(upload)?.releasedAt).toBeNull();
  });
});
