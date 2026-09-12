import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { LegalEntity } from "../../../domain/entities/legal-entity.js";
import { ACCOUNTING_FACTS } from "../../../domain/events/accounting-facts.js";
import {
  CreditorIdentifierIsImmutableError,
  EntityCannotCollectError,
  InvalidIbanError,
  LegalEntityNotFoundError,
} from "../../../domain/errors/accounting-errors.js";
import { LegalEntityRepository } from "../../../domain/ports/legal-entity.repository.js";
import { CreditorIdentifier } from "../../../domain/value-objects/creditor-identifier.js";
import { Iban } from "../../../domain/value-objects/iban.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { Siren } from "../../../domain/value-objects/siren.js";
import { AssignCreditorIdentifierHandler } from "../assign-creditor-identifier.handler.js";
import { DeclareLegalEntityHandler } from "../declare-legal-entity.handler.js";
import {
  AssignCreditorIdentifierCommand,
  DeclareLegalEntityCommand,
  SetCreditorAccountCommand,
  SetLegalEntityArchivedCommand,
} from "../legal-entity-commands.js";
import { SetCreditorAccountHandler } from "../set-creditor-account.handler.js";
import { LastActiveLegalEntityError } from "../../../domain/errors/accounting-errors.js";
import { SetLegalEntityArchivedHandler } from "../set-legal-entity-archived.handler.js";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const ICS = "FR72ZZZ123456";
/** IBAN d'exemple de la documentation EPC — clé mod-97 valide. */
const IBAN = "FR1420041010050500013M02606";
/** SIREN dont la clé de Luhn est bonne — un SIREN inventé se fait refuser, et c'est le sujet. */
const SIREN = "552100554";

/** Dépôt en mémoire : il rend l'agrégat, il n'écrit pas de colonnes. */
class InMemoryEntities extends LegalEntityRepository {
  readonly rows = new Map<string, LegalEntity>();

  load(id: string): Promise<LegalEntity | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  save(entity: LegalEntity): Promise<void> {
    this.rows.set(entity.id, entity);
    return Promise.resolve();
  }

  /**
   * Le doublé calcule la réponse au lieu de la simuler : un doublé qui rendrait
   * `true` en dur laisserait la règle « on n'archive pas la dernière » verte
   * quoi qu'il arrive, ce qui est la façon habituelle de tester un garde-fou
   * sans jamais l'éprouver.
   */
  hasAnotherActive(exceptId: string): Promise<boolean> {
    const other = [...this.rows.values()].some((e) => e.id !== exceptId && !e.archived);
    return Promise.resolve(other);
  }
}

function sampleEntity(id = "le1"): LegalEntity {
  return LegalEntity.declare({
    id,
    name: "La Folie Douce",
    legalForm: "SAS",
    siren: Siren.create(SIREN),
    address: LegalAddress.create({
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
    rcs: "Chambéry B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR89552100554",
  });
}

describe("DeclareLegalEntityHandler", () => {
  it("déclare une entité SANS ICS ni compte — l'attente de la Banque de France est un état normal", async () => {
    const entities = new InMemoryEntities();
    const events = new RecordingPublisher();
    const handler = new DeclareLegalEntityHandler(
      entities,
      new FixedIdGenerator("le"),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );

    const id = await handler.execute(
      new DeclareLegalEntityCommand({
        name: "La Folie Douce",
        legalForm: "SAS",
        siren: SIREN,
        rcs: "",
        shareCapitalCents: 1_000_000,
        vatNumber: "",
        address: {
          line1: "12 rue du Fournil",
          line2: "",
          postalCode: "73000",
          city: "Chambéry",
          countryCode: "FR",
        },
      }),
    );

    const stored = entities.rows.get(id);
    expect(stored?.toPersistence()).toMatchObject({ ics: null, creditorIban: null });
    // Déclarée mais inutilisable : c'est exactement ce que la fiche doit dire.
    expect(stored?.canCollect()).toBe(false);
    expect(events.factTypes()).toEqual([ACCOUNTING_FACTS.legalEntityDeclared]);
  });

  it("refuse un SIREN mal formé AVANT toute écriture", async () => {
    const entities = new InMemoryEntities();
    const handler = new DeclareLegalEntityHandler(
      entities,
      new FixedIdGenerator("le"),
      new FixedClock(NOW),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new DeclareLegalEntityCommand({
          name: "La Folie Douce",
          legalForm: "SAS",
          // Un SIRET collé dans le champ SIREN : l'erreur réaliste.
          siren: "81245678900021",
          rcs: "",
          shareCapitalCents: 0,
          vatNumber: "",
          address: {
            line1: "12 rue du Fournil",
            line2: "",
            postalCode: "73000",
            city: "Chambéry",
            countryCode: "FR",
          },
        }),
      ),
    ).rejects.toThrow();
    expect(entities.rows.size).toBe(0);
  });
});

describe("AssignCreditorIdentifierHandler", () => {
  function doubles(): {
    handler: AssignCreditorIdentifierHandler;
    entities: InMemoryEntities;
    events: RecordingPublisher;
  } {
    const entities = new InMemoryEntities();
    entities.rows.set("le1", sampleEntity());
    const events = new RecordingPublisher();
    return {
      entities,
      events,
      handler: new AssignCreditorIdentifierHandler(
        entities,
        new FixedClock(NOW),
        events,
        new DirectUnitOfWork(),
      ),
    };
  }

  it("attribue l'ICS et le journalise — c'est lui qu'on cherchera devant un mandat contesté", async () => {
    const { handler, entities, events } = doubles();

    await handler.execute(new AssignCreditorIdentifierCommand("le1", ICS));

    expect(entities.rows.get("le1")?.toPersistence().ics).toBe(ICS);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: ACCOUNTING_FACTS.creditorIdentifierAssigned,
      payload: { ics: ICS },
    });
  });

  it("accepte le MÊME ICS rejoué — un double-clic n'est pas une faute", async () => {
    const { handler, entities } = doubles();

    await handler.execute(new AssignCreditorIdentifierCommand("le1", ICS));
    await handler.execute(new AssignCreditorIdentifierCommand("le1", "fr72-zzz 123456"));

    expect(entities.rows.get("le1")?.toPersistence().ics).toBe(ICS);
  });

  it("refuse un AUTRE ICS : les mandats signés portent l'ancien, imprimé", async () => {
    const { handler, entities } = doubles();
    await handler.execute(new AssignCreditorIdentifierCommand("le1", ICS));

    await expect(
      handler.execute(new AssignCreditorIdentifierCommand("le1", "FR72ZZZ999999")),
    ).rejects.toBeInstanceOf(CreditorIdentifierIsImmutableError);
    expect(entities.rows.get("le1")?.toPersistence().ics).toBe(ICS);
  });

  it("refuse en 404 sur une entité inconnue", async () => {
    const { handler } = doubles();

    await expect(
      handler.execute(new AssignCreditorIdentifierCommand("absente", ICS)),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
  });
});

describe("SetCreditorAccountHandler", () => {
  function doubles(): {
    handler: SetCreditorAccountHandler;
    entities: InMemoryEntities;
    events: RecordingPublisher;
  } {
    const entities = new InMemoryEntities();
    entities.rows.set("le1", sampleEntity());
    const events = new RecordingPublisher();
    return {
      entities,
      events,
      handler: new SetCreditorAccountHandler(
        entities,
        new FixedClock(NOW),
        events,
        new DirectUnitOfWork(),
      ),
    };
  }

  it("enregistre le compte, et le compte SEUL sort en quatre caractères", async () => {
    const { handler, entities, events } = doubles();

    await handler.execute(new SetCreditorAccountCommand("le1", IBAN));

    expect(entities.rows.get("le1")?.toPersistence().creditorIban).toBe(IBAN);
    const fact = events.traced[0]?.journalFact();
    expect(fact).toMatchObject({
      type: ACCOUNTING_FACTS.creditorAccountChanged,
      payload: { last4: "2606" },
    });
    // 🔴 Régression : une trace se relit des années après, par du personnel qui
    // n'a pas à connaître le compte. L'IBAN ne doit apparaître NULLE PART dedans.
    expect(JSON.stringify(fact)).not.toContain(IBAN);
  });

  it("refuse un IBAN dont la clé mod-97 est fausse — la faute de frappe ne se voit pas à l'œil", async () => {
    const { handler, entities } = doubles();

    await expect(
      // Deux chiffres intervertis dans la clé.
      handler.execute(new SetCreditorAccountCommand("le1", "FR4120041010050500013M02606")),
    ).rejects.toBeInstanceOf(InvalidIbanError);
    expect(entities.rows.get("le1")?.toPersistence().creditorIban).toBeNull();
  });

  it("le compte change librement — on peut changer de banque, contrairement à l'ICS", async () => {
    const { handler, entities } = doubles();

    await handler.execute(new SetCreditorAccountCommand("le1", IBAN));
    await handler.execute(new SetCreditorAccountCommand("le1", "FR7630006000011234567890189"));

    expect(entities.rows.get("le1")?.toPersistence().creditorIban).toBe(
      "FR7630006000011234567890189",
    );
  });
});

describe("SetLegalEntityArchivedHandler", () => {
  /**
   * La règle porte sur l'ENSEMBLE, pas sur l'instance : `archive()` ne peut pas
   * la tenir, un agrégat ne voyant pas ses frères. Elle vit donc dans le
   * handler, et c'est ici qu'elle s'éprouve — l'e2e la reprend sur le fil.
   */
  it("REFUSE d'archiver la dernière entité en service, et n'écrit rien", async () => {
    const entities = new InMemoryEntities();
    entities.rows.set("le1", sampleEntity());
    const events = new RecordingPublisher();
    const handler = new SetLegalEntityArchivedHandler(
      entities,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );

    await expect(handler.execute(new SetLegalEntityArchivedCommand("le1", true))).rejects.toThrow(
      LastActiveLegalEntityError,
    );
    expect(entities.rows.get("le1")?.archived).toBe(false);
    // Aucun fait publié : un refus qui aurait journalisé ferait croire à un
    // archivage qui n'a pas eu lieu.
    expect(events.published).toHaveLength(0);
  });

  it("laisse TOUJOURS remettre en service — ça ne peut qu'ajouter un émetteur", async () => {
    const entities = new InMemoryEntities();
    const entity = sampleEntity();
    entity.archive(NOW);
    entities.rows.set("le1", entity);
    const handler = new SetLegalEntityArchivedHandler(
      entities,
      new FixedClock(NOW),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );

    await handler.execute(new SetLegalEntityArchivedCommand("le1", false));
    expect(entities.rows.get("le1")?.archived).toBe(false);
  });

  it("archive sans rien effacer, et l'entité archivée n'encaisse plus", async () => {
    const entities = new InMemoryEntities();
    const entity = sampleEntity();
    entity.assignCreditorIdentifier(CreditorIdentifier.create(ICS));
    entity.setCreditorAccount(Iban.create(IBAN));
    entities.rows.set("le1", entity);
    // Une seconde entité, sans quoi le handler refuse : on n'archive pas la
    // dernière en service.
    entities.rows.set("le2", sampleEntity("le2"));
    const events = new RecordingPublisher();
    const handler = new SetLegalEntityArchivedHandler(
      entities,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );

    expect(entity.canCollect()).toBe(true);
    await handler.execute(new SetLegalEntityArchivedCommand("le1", true));

    const archived = entities.rows.get("le1");
    expect(archived?.archived).toBe(true);
    expect(archived?.canCollect()).toBe(false);
    // Rien n'est effacé : l'identité reste lisible pour les documents qui la citent.
    expect(archived?.toPersistence()).toMatchObject({ ics: ICS, name: "La Folie Douce" });
    expect(() => archived?.creditorSnapshot()).toThrow(EntityCannotCollectError);
    expect(events.factTypes()).toEqual([ACCOUNTING_FACTS.legalEntityArchived]);
  });

  it("remise en service : le fait dit lequel des deux sens on a pris", async () => {
    const entities = new InMemoryEntities();
    const entity = sampleEntity();
    entity.archive(NOW);
    entities.rows.set("le1", entity);
    const events = new RecordingPublisher();

    await new SetLegalEntityArchivedHandler(
      entities,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    ).execute(new SetLegalEntityArchivedCommand("le1", false));

    expect(entities.rows.get("le1")?.archived).toBe(false);
    expect(events.factTypes()).toEqual([ACCOUNTING_FACTS.legalEntityRestored]);
  });
});
