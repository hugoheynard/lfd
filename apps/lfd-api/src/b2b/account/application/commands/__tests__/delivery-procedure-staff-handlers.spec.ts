import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import { CompanyAddressNotFoundError } from "../../../domain/errors/account-errors.js";
import { ACCOUNT_FACTS } from "../../../domain/events/account-facts.js";
import {
  ADDRESS,
  COMPANY,
  InMemoryProcedures,
  InMemoryStore,
  RecordingLock,
  TrackingUnitOfWork,
  TransactionAwarePublisher,
  addressBook,
  pngOf,
} from "../../__tests__/delivery-procedure-doubles.js";
import { AddDeliveryStepByStaffHandler } from "../add-delivery-step-by-staff.handler.js";
import {
  AddDeliveryStepByStaffCommand,
  RemoveDeliveryStepByStaffCommand,
  ReorderDeliveryStepsByStaffCommand,
  ReviseDeliveryStepByStaffCommand,
} from "../admin-delivery-procedure-commands.js";
import { RemoveDeliveryStepByStaffHandler } from "../remove-delivery-step-by-staff.handler.js";
import { ReorderDeliveryStepsByStaffHandler } from "../reorder-delivery-steps-by-staff.handler.js";
import { ReviseDeliveryStepByStaffHandler } from "../revise-delivery-step-by-staff.handler.js";
import { COMPANY_LABEL, InMemoryCompanies, journalNames } from "./member-acts-doubles.js";

/**
 * **Les gestes d'un agent sur la procédure de livraison d'un client.**
 *
 * Ce qu'on tient ici : aucun mur membership (l'agent n'est membre de rien), un
 * fait `company.delivery_procedure_edited` par geste, qui nomme le geste et
 * part DANS la transaction — et, s'il ne part pas, le geste n'a pas eu lieu.
 */

const FIELDS = { title: "Portail", body: "" };

function scene(live: readonly string[] = [ADDRESS]) {
  const log: string[] = [];
  const procedures = new InMemoryProcedures(log);
  const store = new InMemoryStore(log);
  const uow = new TrackingUnitOfWork();
  const events = new TransactionAwarePublisher(uow);
  const book = addressBook(live);
  const deps = [
    book,
    procedures,
    new RecordingLock([]),
    store,
    new FixedIdGenerator(),
    uow,
    events,
    journalNames(new InMemoryCompanies(), book),
  ] as const;
  return {
    procedures,
    store,
    events,
    add: new AddDeliveryStepByStaffHandler(...deps),
    revise: new ReviseDeliveryStepByStaffHandler(...deps),
    remove: new RemoveDeliveryStepByStaffHandler(...deps),
    reorder: new ReorderDeliveryStepsByStaffHandler(...deps),
  };
}

function addCommand(photo: Buffer | null = null): AddDeliveryStepByStaffCommand {
  return new AddDeliveryStepByStaffCommand(COMPANY, ADDRESS, FIELDS, photo);
}

describe("les gestes staff sur la procédure", () => {
  it("chaque geste inscrit son fait, avec son action, dans la transaction", async () => {
    const current = scene();
    const first = await current.add.execute(addCommand());
    const second = await current.add.execute(addCommand());
    await current.revise.execute(
      new ReviseDeliveryStepByStaffCommand(COMPANY, ADDRESS, first, FIELDS, false, null),
    );
    await current.reorder.execute(
      new ReorderDeliveryStepsByStaffCommand(COMPANY, ADDRESS, [second, first]),
    );
    await current.remove.execute(new RemoveDeliveryStepByStaffCommand(COMPANY, ADDRESS, first));

    const facts = current.events.traced.map((event) => event.journalFact());
    expect(facts.map((fact) => fact.type)).toEqual(
      Array.from({ length: 5 }, () => ACCOUNT_FACTS.deliveryProcedureEdited),
    );
    expect(facts.map((fact) => fact.payload)).toEqual(
      ["step_added", "step_added", "step_revised", "reordered", "step_removed"].map((action) => ({
        // La société est le sujet (nommée), l'adresse citée par son id et son
        // lieu — jamais son libellé (lot B du plan des phrases).
        subjectLabel: COMPANY_LABEL,
        address: { id: ADDRESS, ville: "Paris", codePostal: "75001" },
        action,
      })),
    );
    expect(facts[0]).toMatchObject({ subjectType: "company", subjectId: COMPANY });
    expect(current.events.insideTransaction).toEqual([true, true, true, true, true]);
  });

  it("n'inscrit rien quand l'écriture échoue", async () => {
    const current = scene();
    current.procedures.failSave = true;
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      DocumentStorageUnavailableError,
    );
    expect(current.events.traced).toEqual([]);
  });

  it("retire la photo neuve quand le journal refuse le fait — le geste n'a pas eu lieu", async () => {
    const current = scene();
    current.events.failTraced = true;
    await expect(current.add.execute(addCommand(pngOf(8, 8)))).rejects.toBeInstanceOf(
      DocumentStorageUnavailableError,
    );
    expect(current.store.objects.size).toBe(0);
  });

  it("garde le rattachement au carnet : une adresse d'un autre carnet est introuvable", async () => {
    const current = scene(["another-address"]);
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      CompanyAddressNotFoundError,
    );
    expect(current.events.traced).toEqual([]);
  });
});
