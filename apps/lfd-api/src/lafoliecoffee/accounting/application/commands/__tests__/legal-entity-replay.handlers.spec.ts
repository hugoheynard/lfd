import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntity } from "../../../domain/entities/legal-entity.js";
import { LegalEntityRepository } from "../../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { Siren } from "../../../domain/value-objects/siren.js";
import { AssignCreditorIdentifierHandler } from "../assign-creditor-identifier.handler.js";
import { CorrectLegalEntityHandler } from "../correct-legal-entity.handler.js";
import { DeclareLegalEntityHandler } from "../declare-legal-entity.handler.js";
import {
  AssignCreditorIdentifierCommand,
  CorrectLegalEntityCommand,
  DeclareLegalEntityCommand,
  SetCreditorAccountCommand,
  SetLegalEntityArchivedCommand,
  SetPreNotificationCommand,
} from "../legal-entity-commands.js";
import { SetCreditorAccountHandler } from "../set-creditor-account.handler.js";
import { SetLegalEntityArchivedHandler } from "../set-legal-entity-archived.handler.js";
import { SetPreNotificationHandler } from "../set-pre-notification.handler.js";

/**
 * **Une saisie rejouée ne refait rien** — la fiche de l'entité émettrice. Un
 * double clic ou un réseau qui rejoue la même requête trouve la valeur déjà
 * posée : ni écriture, ni fait au journal, ni proposition de compte de plus.
 * Les instants ne sont comparés qu'entre eux.
 */

const NOW = new Date("2026-09-10T09:00:00.000Z");
const LATER = new Date("2026-09-11T09:00:00.000Z");
const ADDRESS = {
  line1: "12 rue du Fournil",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
const ACCOUNT_PAYLOAD = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const OTHER_IBAN = "FR7630006000011234567890189";

class MemoryEntities extends LegalEntityRepository {
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
  hasAnotherActive(exceptId: string): Promise<boolean> {
    return Promise.resolve([...this.rows.values()].some((e) => e.id !== exceptId && !e.archived));
  }
  invoicePrefixHolder(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

function world(clock = new FixedClock(NOW)) {
  const entities = new MemoryEntities();
  for (const id of ["le1", "le2"]) {
    entities.rows.set(
      id,
      LegalEntity.declare({
        id,
        name: "La Folie Douce",
        legalForm: "SAS",
        siren: Siren.create("552100554"),
        address: LegalAddress.create(ADDRESS),
        rcs: "Chambéry B 552 100 554",
        shareCapitalCents: 1_000_000,
        vatNumber: "FR89552100554",
      }),
    );
  }
  const events = new RecordingPublisher();
  return { entities, events, clock, uow: new DirectUnitOfWork() };
}

describe("La fiche de l'entité — une saisie rejouée", () => {
  /**
   * Régression : un double clic sur « Déclarer » finissait en refus (SIREN
   * déjà déclaré) sur le second envoi, après un succès.
   */
  it("la même clé rend la même entité, sans en déclarer une seconde", async () => {
    const w = world();
    const handler = new DeclareLegalEntityHandler(
      w.entities,
      new FixedIdGenerator("le"),
      w.clock,
      w.events,
      w.uow,
      inMemoryIntents(),
    );
    const command = new DeclareLegalEntityCommand(
      {
        name: "Les Tommeuses",
        legalForm: "SAS",
        siren: "552100554",
        rcs: "",
        shareCapitalCents: 100_000,
        vatNumber: "",
        address: ADDRESS,
      },
      "staff_a",
      "cle-1",
    );

    const first = await handler.execute(command);
    const replay = await handler.execute(command);

    expect(replay).toBe(first);
    expect(w.entities.rows.size).toBe(3);
    expect(w.events.traced).toHaveLength(1);
  });

  /** Régression : la même correction rejouée réécrivait `legal_entity.corrected`. */
  it("la même correction n'écrit rien et ne rejournalise pas", async () => {
    const w = world();
    const handler = new CorrectLegalEntityHandler(w.entities, w.clock, w.events, w.uow);
    const payload = {
      name: "La Folie Douce SAS",
      legalForm: "SAS",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
      address: ADDRESS,
    };

    await handler.execute(new CorrectLegalEntityCommand("le1", payload));
    await handler.execute(new CorrectLegalEntityCommand("le1", payload));

    expect(w.events.traced).toHaveLength(1);
    expect(w.entities.saves).toBe(1);
  });

  /** Régression : le même ICS rejoué rejournalisait son attribution. */
  it("le même ICS rejoué ne rejournalise pas son attribution", async () => {
    const w = world();
    const handler = new AssignCreditorIdentifierHandler(w.entities, w.clock, w.events, w.uow);

    await handler.execute(new AssignCreditorIdentifierCommand("le1", "FR72ZZZ123456"));
    await handler.execute(new AssignCreditorIdentifierCommand("le1", "FR72ZZZ123456"));

    expect(w.events.traced).toHaveLength(1);
  });

  /** Régression : le même délai rejoué rejournalisait le changement. */
  it("le même délai de pré-notification rejoué ne rejournalise pas", async () => {
    const w = world();
    const handler = new SetPreNotificationHandler(w.entities, w.clock, w.events, w.uow);

    await handler.execute(new SetPreNotificationCommand("le1", 10));
    await handler.execute(new SetPreNotificationCommand("le1", 10));

    expect(w.events.traced).toHaveLength(1);
  });

  /** Régression : un archivage rejoué re-datait l'archivage et le rejournalisait. */
  it("un archivage rejoué garde sa date et ne rejournalise pas", async () => {
    const clock = new FixedClock(NOW);
    const w = world(clock);
    const handler = new SetLegalEntityArchivedHandler(w.entities, clock, w.events, w.uow);

    await handler.execute(new SetLegalEntityArchivedCommand("le1", true));
    clock.set(LATER);
    await handler.execute(new SetLegalEntityArchivedCommand("le1", true));

    expect(w.entities.rows.get("le1")?.toPersistence().archivedAt).toEqual(NOW);
    expect(w.events.traced).toHaveLength(1);
  });

  /**
   * Régression : la première saisie du compte rejouée devenait une proposition
   * de ce même compte, à faire confirmer par un second membre.
   */
  it("la première saisie du compte rejouée ne propose pas le compte déjà en place", async () => {
    const w = world();
    const handler = accountHandler(w);

    await handler.execute(new SetCreditorAccountCommand("le1", ACCOUNT_PAYLOAD, "staff_a"));
    await handler.execute(new SetCreditorAccountCommand("le1", ACCOUNT_PAYLOAD, "staff_a"));

    expect(w.entities.rows.get("le1")?.toPersistence().pendingCreditorIban).toBeNull();
    expect(w.events.traced).toHaveLength(1);
  });

  /**
   * Régression : une proposition rejouée en remplaçait une autre, sous un
   * identifiant neuf — la confirmation en cours chez le second membre était
   * refusée comme périmée.
   */
  it("une proposition rejouée garde son identifiant et ne rejournalise pas", async () => {
    const w = world();
    const handler = accountHandler(w);
    const proposal = { ...ACCOUNT_PAYLOAD, iban: OTHER_IBAN };
    await handler.execute(new SetCreditorAccountCommand("le1", ACCOUNT_PAYLOAD, "staff_a"));

    await handler.execute(new SetCreditorAccountCommand("le1", proposal, "staff_a"));
    await handler.execute(new SetCreditorAccountCommand("le1", proposal, "staff_a"));

    expect(w.entities.rows.get("le1")?.toPersistence()).toMatchObject({
      pendingCreditorIban: OTHER_IBAN,
      pendingCreditorAccountId: "id_000002",
    });
    expect(w.events.traced).toHaveLength(2);
  });
});

function accountHandler(w: ReturnType<typeof world>): SetCreditorAccountHandler {
  return new SetCreditorAccountHandler(
    w.entities,
    w.clock,
    new FixedIdGenerator("id"),
    w.events,
    w.uow,
  );
}
