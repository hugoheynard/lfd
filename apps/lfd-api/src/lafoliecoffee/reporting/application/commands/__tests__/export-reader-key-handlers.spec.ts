import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ExportReaderKeyAlreadyRevokedError,
  ExportReaderKeyExpiryInPastError,
  ExportReaderKeyNotFoundError,
  ExportReaderKeySecretAlreadyShownError,
} from "../../../domain/errors/export-reader-key-errors.js";
import { hashExportKeySecret } from "../../../domain/value-objects/export-key-secret.js";
import { IssueExportReaderKeyCommand } from "../issue-export-reader-key.command.js";
import { IssueExportReaderKeyHandler } from "../issue-export-reader-key.handler.js";
import { RevokeExportReaderKeyCommand } from "../revoke-export-reader-key.command.js";
import { RevokeExportReaderKeyHandler } from "../revoke-export-reader-key.handler.js";
import { FixedExportKeySecrets, MemoryExportReaderKeys } from "./export-reader-key.doubles.js";

/** L'horloge est doublée : les dates ne se comparent qu'à elle. */
const AT = new Date("2026-11-23T09:00:00.000Z");
const PAYLOAD = {
  label: "Direction",
  expiresAt: "2027-11-23T09:00:00.000Z",
  allowedIps: ["203.0.113.7"],
};

function scene() {
  const keys = new MemoryExportReaderKeys();
  const journal = new RecordingJournal();
  const clock = new FixedClock(AT);
  const intents = inMemoryIntents();
  const issue = new IssueExportReaderKeyHandler(
    keys,
    new FixedExportKeySecrets(),
    new FixedIdGenerator("key"),
    clock,
    journal,
    new DirectUnitOfWork(),
    intents,
  );
  const revoke = new RevokeExportReaderKeyHandler(
    keys,
    clock,
    journal,
    new DirectUnitOfWork(),
    intents,
  );
  return { keys, journal, issue, revoke };
}

describe("Créer une clé d'export", () => {
  it("rend le secret en clair une fois, ne range que son haché, et journalise", async () => {
    const { keys, journal, issue } = scene();

    const issued = await issue.execute(
      new IssueExportReaderKeyCommand(PAYLOAD, "staff_1", randomUUID()),
    );

    expect(issued.id).toBe("key_000001");
    expect(issued.secret).toHaveLength(43);
    const state = keys.saved[0]?.toPersistence();
    expect(state?.secretHash).toBe(hashExportKeySecret(issued.secret));
    expect(state).toMatchObject({ createdByStaffId: "staff_1", allowedIps: ["203.0.113.7"] });
    expect(journal.facts).toEqual([
      {
        type: "export_key.created",
        subjectType: "export_reader_key",
        subjectId: "key_000001",
        payload: { subjectLabel: "Direction", expiresAt: PAYLOAD.expiresAt, allowedIpCount: 1 },
      },
    ]);
  });

  /** Régression attendue : un double clic créerait deux clés. */
  it("rejouée sous la même clé d'intention, refuse en nommant le secret déjà montré et n'en crée pas d'autre", async () => {
    const { keys, journal, issue } = scene();
    const intent = randomUUID();

    await issue.execute(new IssueExportReaderKeyCommand(PAYLOAD, "staff_1", intent));
    await expect(
      issue.execute(new IssueExportReaderKeyCommand(PAYLOAD, "staff_1", intent)),
    ).rejects.toThrow(ExportReaderKeySecretAlreadyShownError);

    expect(keys.saved).toHaveLength(1);
    expect(journal.types()).toEqual(["export_key.created"]);
  });

  it("refuse une échéance passée : rien rangé, rien journalisé", async () => {
    const { keys, journal, issue } = scene();

    await expect(
      issue.execute(
        new IssueExportReaderKeyCommand(
          { ...PAYLOAD, expiresAt: "2026-11-22T09:00:00.000Z" },
          "staff_1",
          randomUUID(),
        ),
      ),
    ).rejects.toThrow(ExportReaderKeyExpiryInPastError);
    expect(keys.saved).toHaveLength(0);
    expect(journal.facts).toHaveLength(0);
  });
});

describe("Révoquer une clé d'export", () => {
  it("révoque, range et journalise", async () => {
    const { keys, journal, issue, revoke } = scene();
    const { id } = await issue.execute(
      new IssueExportReaderKeyCommand(PAYLOAD, "staff_1", randomUUID()),
    );

    await revoke.execute(new RevokeExportReaderKeyCommand(id, "staff_2", randomUUID()));

    expect((await keys.load(id))?.toPersistence()).toMatchObject({
      revokedAt: AT,
      revokedByStaffId: "staff_2",
    });
    expect(journal.types()).toEqual(["export_key.created", "export_key.revoked"]);
  });

  it("rejouée sous la même intention, ne refait rien et ne lève pas", async () => {
    const { journal, issue, revoke } = scene();
    const { id } = await issue.execute(
      new IssueExportReaderKeyCommand(PAYLOAD, "staff_1", randomUUID()),
    );
    const intent = randomUUID();

    await revoke.execute(new RevokeExportReaderKeyCommand(id, "staff_2", intent));
    await revoke.execute(new RevokeExportReaderKeyCommand(id, "staff_2", intent));

    expect(journal.types()).toEqual(["export_key.created", "export_key.revoked"]);
  });

  it("refuse une seconde révocation sous une autre intention", async () => {
    const { journal, issue, revoke } = scene();
    const { id } = await issue.execute(
      new IssueExportReaderKeyCommand(PAYLOAD, "staff_1", randomUUID()),
    );
    await revoke.execute(new RevokeExportReaderKeyCommand(id, "staff_2", randomUUID()));

    await expect(
      revoke.execute(new RevokeExportReaderKeyCommand(id, "staff_2", randomUUID())),
    ).rejects.toThrow(ExportReaderKeyAlreadyRevokedError);
    expect(journal.types()).toEqual(["export_key.created", "export_key.revoked"]);
  });

  it("refuse une clé inconnue", async () => {
    const { revoke } = scene();

    await expect(
      revoke.execute(new RevokeExportReaderKeyCommand("absente", "staff_2", randomUUID())),
    ).rejects.toThrow(ExportReaderKeyNotFoundError);
  });
});
