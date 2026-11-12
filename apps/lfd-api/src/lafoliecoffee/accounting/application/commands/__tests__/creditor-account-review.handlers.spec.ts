import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntity } from "../../../domain/entities/legal-entity.js";
import { ACCOUNTING_FACTS } from "../../../domain/events/accounting-facts.js";
import {
  InvalidIbanError,
  LegalEntityNotFoundError,
} from "../../../domain/errors/accounting-errors.js";
import {
  CreditorAccountIbanMismatchError,
  CreditorAccountSelfConfirmationError,
  PendingCreditorAccountGoneError,
} from "../../../domain/errors/creditor-account-review-errors.js";
import { LegalEntityRepository } from "../../../domain/ports/legal-entity.repository.js";
import { Bic } from "../../../domain/value-objects/bic.js";
import { CreditorAccount } from "../../../domain/value-objects/creditor-account.js";
import { CreditorIdentifier } from "../../../domain/value-objects/creditor-identifier.js";
import { Iban } from "../../../domain/value-objects/iban.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { Siren } from "../../../domain/value-objects/siren.js";
import { CancelPendingCreditorAccountHandler } from "../cancel-pending-creditor-account.handler.js";
import { ConfirmCreditorAccountHandler } from "../confirm-creditor-account.handler.js";
import {
  CancelPendingCreditorAccountCommand,
  ConfirmCreditorAccountCommand,
} from "../legal-entity-commands.js";

const NOW = new Date(0);
const OLD_IBAN = "FR1420041010050500013M02606";
const NEW_IBAN = "FR7630006000011234567890189";
const AUTHOR = "staff_author";
const CONFIRMER = "staff_confirmer";

/** Dépôt en mémoire : il rend l'agrégat, et compte ce qu'on lui fait écrire. */
class InMemoryEntities extends LegalEntityRepository {
  readonly rows = new Map<string, LegalEntity>();
  saves = 0;

  load(id: string): Promise<LegalEntity | null> {
    const entity = this.rows.get(id);
    // Une relecture, pas l'objet tenu : un refus ne doit rien laisser derrière lui.
    return Promise.resolve(
      entity === undefined ? null : LegalEntity.reconstitute(entity.toPersistence()),
    );
  }

  save(entity: LegalEntity): Promise<void> {
    this.saves += 1;
    this.rows.set(entity.id, entity);
    return Promise.resolve();
  }

  hasAnotherActive(): Promise<boolean> {
    return Promise.resolve(false);
  }

  invoicePrefixHolder(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

function rib(iban: string): CreditorAccount {
  return CreditorAccount.create({
    holder: "Crazeativity",
    address: LegalAddress.create({
      line1: "Route de la Balme",
      line2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
    }),
    iban: Iban.create(iban),
    bic: Bic.create("CEPAFRPP751"),
  });
}

/** Une entité qui encaisse sur `OLD_IBAN`, et une modification vers `NEW_IBAN` qui attend. */
function withPending(): InMemoryEntities {
  const entity = LegalEntity.declare({
    id: "le1",
    name: "La Folie Coffee",
    legalForm: "SAS",
    siren: Siren.create("552100554"),
    address: LegalAddress.create({
      line1: "12 rue des Lilas",
      line2: "",
      postalCode: "75011",
      city: "Paris",
      countryCode: "FR",
    }),
    rcs: "",
    shareCapitalCents: 0,
    vatNumber: "",
  });
  entity.assignCreditorIdentifier(CreditorIdentifier.create("FR72ZZZ123456"));
  entity.setCreditorAccount(rib(OLD_IBAN), { id: "first", staffId: AUTHOR, at: NOW });
  entity.setCreditorAccount(rib(NEW_IBAN), { id: "pending_1", staffId: AUTHOR, at: NOW });
  const entities = new InMemoryEntities();
  entities.rows.set("le1", entity);
  return entities;
}

describe("ConfirmCreditorAccountHandler", () => {
  function handlerOn(entities: InMemoryEntities, events = new RecordingPublisher()) {
    return new ConfirmCreditorAccountHandler(
      entities,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
  }

  it("confirme, écrit, et journalise le changement de compte sans l'IBAN", async () => {
    const entities = withPending();
    const events = new RecordingPublisher();

    await handlerOn(entities, events).execute(
      new ConfirmCreditorAccountCommand("le1", "pending_1", NEW_IBAN, CONFIRMER),
    );

    expect(entities.rows.get("le1")?.creditorSnapshot().creditorIban).toBe(NEW_IBAN);
    expect(entities.rows.get("le1")?.pendingCreditorAccount).toBeNull();
    const fact = events.traced[0]?.journalFact();
    expect(fact).toMatchObject({
      type: ACCOUNTING_FACTS.creditorAccountChanged,
      payload: { last4: "0189" },
    });
    expect(JSON.stringify(fact)).not.toContain(NEW_IBAN);
  });

  it.each([
    ["l'auteur de la saisie", "pending_1", NEW_IBAN, AUTHOR, CreditorAccountSelfConfirmationError],
    [
      "un IBAN ressaisi différent",
      "pending_1",
      OLD_IBAN,
      CONFIRMER,
      CreditorAccountIbanMismatchError,
    ],
    [
      "une saisie qui n'attend plus",
      "pending_0",
      NEW_IBAN,
      CONFIRMER,
      PendingCreditorAccountGoneError,
    ],
    [
      "un IBAN ressaisi mal formé",
      "pending_1",
      "FR4120041010050500013M02606",
      CONFIRMER,
      InvalidIbanError,
    ],
  ])(
    "refuse %s, sans rien écrire ni journaliser",
    async (_case, pendingId, iban, staffId, error) => {
      const entities = withPending();
      const events = new RecordingPublisher();

      await expect(
        handlerOn(entities, events).execute(
          new ConfirmCreditorAccountCommand("le1", pendingId, iban, staffId),
        ),
      ).rejects.toBeInstanceOf(error);
      expect(entities.saves).toBe(0);
      expect(events.traced).toEqual([]);
    },
  );

  it("refuse en 404 une entité inconnue", async () => {
    await expect(
      handlerOn(new InMemoryEntities()).execute(
        new ConfirmCreditorAccountCommand("absente", "pending_1", NEW_IBAN, CONFIRMER),
      ),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
  });
});

describe("CancelPendingCreditorAccountHandler", () => {
  function handlerOn(entities: InMemoryEntities, events = new RecordingPublisher()) {
    return new CancelPendingCreditorAccountHandler(
      entities,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
  }

  it("annule, garde le compte confirmé, et journalise l'annulation", async () => {
    const entities = withPending();
    const events = new RecordingPublisher();

    await handlerOn(entities, events).execute(
      new CancelPendingCreditorAccountCommand("le1", "pending_1"),
    );

    expect(entities.rows.get("le1")?.pendingCreditorAccount).toBeNull();
    expect(entities.rows.get("le1")?.creditorSnapshot().creditorIban).toBe(OLD_IBAN);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: ACCOUNTING_FACTS.creditorAccountProposalCancelled,
      payload: { pendingId: "pending_1", last4: "0189" },
    });
  });

  it("refuse une saisie qui n'attend plus, sans rien écrire", async () => {
    const entities = withPending();

    await expect(
      handlerOn(entities).execute(new CancelPendingCreditorAccountCommand("le1", "pending_0")),
    ).rejects.toBeInstanceOf(PendingCreditorAccountGoneError);
    expect(entities.saves).toBe(0);
  });
});
