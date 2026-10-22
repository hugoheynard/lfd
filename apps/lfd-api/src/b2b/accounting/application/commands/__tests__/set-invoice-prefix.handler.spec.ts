import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntity } from "../../../domain/entities/legal-entity.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  InvalidInvoicePrefixError,
  InvoicePrefixIsFrozenError,
  InvoicePrefixTakenError,
} from "../../../domain/errors/invoice-errors.js";
import { ACCOUNTING_FACTS } from "../../../domain/events/accounting-facts.js";
import { LegalEntityRepository } from "../../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { Siren } from "../../../domain/value-objects/siren.js";
import { SetInvoicePrefixCommand } from "../legal-entity-commands.js";
import { SetInvoicePrefixHandler } from "../set-invoice-prefix.handler.js";

const NOW = new Date("2026-10-22T09:00:00.000Z");

/** Dépôt en mémoire ; l'unicité se CALCULE sur ce qu'il porte, comme en base. */
class InMemoryEntities extends LegalEntityRepository {
  readonly rows = new Map<string, LegalEntity>();
  saves = 0;

  load(id: string): Promise<LegalEntity | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  save(entity: LegalEntity): Promise<void> {
    this.saves += 1;
    this.rows.set(entity.id, entity);
    return Promise.resolve();
  }
  hasAnotherActive(): Promise<boolean> {
    return Promise.resolve(false);
  }
  invoicePrefixHolder(prefix: string, exceptId: string): Promise<string | null> {
    const holder = [...this.rows.values()].find(
      (entity) => entity.id !== exceptId && entity.toPersistence().invoicePrefix === prefix,
    );
    return Promise.resolve(holder?.name ?? null);
  }
}

function entity(
  id: string,
  name: string,
  siren: string,
  persisted: { invoicePrefix?: string; invoicesIssued?: boolean } = {},
): LegalEntity {
  const declared = LegalEntity.declare({
    id,
    name,
    legalForm: "SAS",
    siren: Siren.create(siren),
    address: LegalAddress.create({
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
    rcs: `Chambéry B ${siren}`,
    shareCapitalCents: 1_000_000,
    vatNumber: "",
  });
  return LegalEntity.reconstitute({
    ...declared.toPersistence(),
    invoicePrefix: persisted.invoicePrefix ?? null,
    invoicesIssued: persisted.invoicesIssued ?? false,
  });
}

function doubles(...seeded: LegalEntity[]) {
  const entities = new InMemoryEntities();
  for (const seed of seeded) {
    entities.rows.set(seed.id, seed);
  }
  const events = new RecordingPublisher();
  const handler = new SetInvoicePrefixHandler(
    entities,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { entities, events, handler };
}

describe("SetInvoicePrefixHandler (lot ZA)", () => {
  it("pose le préfixe, en majuscules, et journalise l'avant et l'après", async () => {
    const { entities, events, handler } = doubles(entity("le1", "La Folie Douce", "552100554"));

    await handler.execute(new SetInvoicePrefixCommand("le1", " lfd "));

    expect(entities.rows.get("le1")?.toPersistence().invoicePrefix).toBe("LFD");
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: ACCOUNTING_FACTS.invoicePrefixSet,
        subjectId: "le1",
        occurredAt: NOW,
        payload: { subjectLabel: "La Folie Douce", from: null, to: "LFD" },
      }),
    ]);
  });

  it("une saisie rejouée n'écrit rien et ne journalise rien", async () => {
    const { entities, events, handler } = doubles(
      entity("le1", "La Folie Douce", "552100554", { invoicePrefix: "LFD" }),
    );

    await handler.execute(new SetInvoicePrefixCommand("le1", "LFD"));

    expect(entities.saves).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse un préfixe déjà pris par une autre entité, en la nommant, sans écrire", async () => {
    const { entities, handler } = doubles(
      entity("le1", "La Folie Douce", "552100554"),
      entity("le2", "Seconde entité", "732829320", { invoicePrefix: "LFD" }),
    );

    const refused = handler.execute(new SetInvoicePrefixCommand("le1", "LFD"));

    await expect(refused).rejects.toBeInstanceOf(InvoicePrefixTakenError);
    await expect(refused).rejects.toThrow(/« Seconde entité »/u);
    expect(entities.saves).toBe(0);
  });

  it("refuse de changer le préfixe d'une entité qui a déjà émis", async () => {
    const { entities, handler } = doubles(
      entity("le1", "La Folie Douce", "552100554", { invoicePrefix: "LFD", invoicesIssued: true }),
    );

    await expect(handler.execute(new SetInvoicePrefixCommand("le1", "LFC"))).rejects.toBeInstanceOf(
      InvoicePrefixIsFrozenError,
    );
    expect(entities.saves).toBe(0);
  });

  it("refuse une forme fausse avant de charger quoi que ce soit", async () => {
    const { handler } = doubles();

    await expect(
      handler.execute(new SetInvoicePrefixCommand("absente", "L1")),
    ).rejects.toBeInstanceOf(InvalidInvoicePrefixError);
  });

  it("refuse en 404 sur une entité inconnue", async () => {
    const { handler } = doubles();

    await expect(
      handler.execute(new SetInvoicePrefixCommand("absente", "LFD")),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
  });
});
