import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DossierRecipientNotFoundError,
  DuplicateDossierRecipientError,
  InvalidRecipientEmailError,
  SuspendedStaffRecipientError,
  UnknownStaffRecipientError,
} from "../../../domain/errors/dossier-recipient-errors.js";
import {
  Directory,
  RecipientsTable,
  staffCard,
} from "../../__tests__/dossier-recipient-doubles.js";
import { AddExternalDossierRecipientCommand } from "../add-external-dossier-recipient.command.js";
import { AddExternalDossierRecipientHandler } from "../add-external-dossier-recipient.handler.js";
import { AddStaffDossierRecipientCommand } from "../add-staff-dossier-recipient.command.js";
import { AddStaffDossierRecipientHandler } from "../add-staff-dossier-recipient.handler.js";
import { RemoveDossierRecipientCommand } from "../remove-dossier-recipient.command.js";
import { RemoveDossierRecipientHandler } from "../remove-dossier-recipient.handler.js";

const NOW = new Date();

function subject() {
  const table = new RecipientsTable();
  const directory = new Directory().put(staffCard());
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const ids = new FixedIdGenerator("rcp");
  const uow = new DirectUnitOfWork();
  return {
    table,
    directory,
    events,
    addStaff: new AddStaffDossierRecipientHandler(table, directory, events, ids, clock, uow),
    addExternal: new AddExternalDossierRecipientHandler(table, events, ids, clock, uow),
    remove: new RemoveDossierRecipientHandler(table, events, clock, uow),
  };
}

const jeanne = (email = "jeanne@x.fr", lastName = "Roux") =>
  new AddExternalDossierRecipientCommand(email, "Jeanne", lastName, "Comptable", "s-admin");

describe("AddStaffDossierRecipientHandler", () => {
  it("inscrit la fiche, rend son id et journalise le nom du moment, sans l'adresse", async () => {
    const { addStaff, table, events } = subject();

    const id = await addStaff.execute(new AddStaffDossierRecipientCommand("s-paul", "s-admin"));

    expect(id).toBe("rcp_000001");
    expect(table.live.map((recipient) => recipient.id)).toEqual(["rcp_000001"]);
    expect(table.live[0]?.addedBy).toBe("s-admin");
    expect(events.factTypes()).toEqual(["production_dossier_recipient.added"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_dossier_recipient",
      subjectId: "rcp_000001",
      payload: {
        subjectLabel: "Paul Martin",
        kind: "staff",
        staffUserId: "s-paul",
      },
    });
  });

  it("refuse une fiche inconnue sans rien écrire", async () => {
    const { addStaff, table, events } = subject();
    await expect(
      addStaff.execute(new AddStaffDossierRecipientCommand("s-x", "s-admin")),
    ).rejects.toThrow(UnknownStaffRecipientError);
    expect(table.saves).toBe(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("refuse une fiche suspendue", async () => {
    const { addStaff, directory, table } = subject();
    directory.put(staffCard({ staffUserId: "s-off", active: false }));
    await expect(
      addStaff.execute(new AddStaffDossierRecipientCommand("s-off", "s-admin")),
    ).rejects.toThrow(SuspendedStaffRecipientError);
    expect(table.saves).toBe(0);
  });

  it("refuse une fiche dont l'adresse est déjà inscrite en externe", async () => {
    const { addStaff, addExternal, events } = subject();
    await addExternal.execute(jeanne("Paul@Fournil.fr"));
    await expect(
      addStaff.execute(new AddStaffDossierRecipientCommand("s-paul", "s-admin")),
    ).rejects.toThrow(DuplicateDossierRecipientError);
    expect(events.factTypes()).toEqual(["production_dossier_recipient.added"]);
  });
});

describe("AddExternalDossierRecipientHandler", () => {
  it("inscrit l'externe et journalise", async () => {
    const { addExternal, table, events } = subject();
    await addExternal.execute(jeanne());
    expect(table.live[0]?.target).toMatchObject({ kind: "external", jobTitle: "Comptable" });
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Jeanne Roux",
      kind: "external",
      staffUserId: null,
    });
  });

  it("refuse un externe à l'adresse d'une fiche déjà inscrite", async () => {
    const { addStaff, addExternal, table } = subject();
    await addStaff.execute(new AddStaffDossierRecipientCommand("s-paul", "s-admin"));
    await expect(addExternal.execute(jeanne("paul@fournil.fr"))).rejects.toThrow(
      DuplicateDossierRecipientError,
    );
    expect(table.saves).toBe(1);
  });

  it("inscrit un externe sans nom et le journalise « un destinataire externe », sans l'adresse", async () => {
    const { addExternal, table, events } = subject();
    await addExternal.execute(
      new AddExternalDossierRecipientCommand("j@x.fr", null, null, null, "s-admin"),
    );
    expect(table.saves).toBe(1);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "un destinataire externe",
      kind: "external",
      staffUserId: null,
    });
  });

  it("refuse un externe sans adresse, avant tout chargement", async () => {
    const { addExternal, table } = subject();
    await expect(
      addExternal.execute(new AddExternalDossierRecipientCommand(" ", null, null, null, "s-admin")),
    ).rejects.toThrow(InvalidRecipientEmailError);
    expect(table.saves).toBe(0);
  });
});

describe("RemoveDossierRecipientHandler", () => {
  it("retire et journalise ce qui partait", async () => {
    const { addExternal, remove, table, events } = subject();
    const id = await addExternal.execute(jeanne());

    await remove.execute(new RemoveDossierRecipientCommand(id, "s-admin"));

    expect(table.live).toEqual([]);
    expect(events.factTypes()).toEqual([
      "production_dossier_recipient.added",
      "production_dossier_recipient.removed",
    ]);
  });

  it("404 sur un destinataire absent, sans journal", async () => {
    const { remove, events } = subject();
    await expect(
      remove.execute(new RemoveDossierRecipientCommand("r-x", "s-admin")),
    ).rejects.toThrow(DossierRecipientNotFoundError);
    expect(events.factTypes()).toEqual([]);
  });
});
