import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import {
  CompanyAddressNotFoundError,
  CompanyAdminRequiredError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import {
  DeliveryProcedureFullError,
  DeliveryProcedureOrderStaleError,
  DeliveryStepNotFoundError,
  DeliveryStepPhotoIntentError,
  InvalidDeliveryStepPhotoError,
} from "../../../domain/errors/delivery-procedure-errors.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import {
  ADDRESS,
  COMPANY,
  InMemoryProcedures,
  InMemoryStore,
  RecordingLock,
  addressBook,
  membership,
  pngOf,
} from "../../__tests__/delivery-procedure-doubles.js";
import { AddDeliveryStepHandler } from "../add-delivery-step.handler.js";
import {
  AddDeliveryStepCommand,
  RemoveDeliveryStepCommand,
  ReorderDeliveryStepsCommand,
  ReviseDeliveryStepCommand,
} from "../delivery-procedure-commands.js";
import { RemoveDeliveryStepHandler } from "../remove-delivery-step.handler.js";
import { ReorderDeliveryStepsHandler } from "../reorder-delivery-steps.handler.js";
import { ReviseDeliveryStepHandler } from "../revise-delivery-step.handler.js";

/**
 * **Les gestes du gestionnaire sur la procédure de livraison.**
 *
 * Deux sujets : le mur (gestionnaire seul, adresse au carnet de la société), et
 * l'ordre des gestes de stockage — ranger la photo neuve AVANT l'écriture,
 * supprimer l'ancienne APRÈS, retirer la neuve si l'écriture échoue, et ne
 * jamais faire échouer la requête pour un nettoyage raté.
 */

const PHOTO = pngOf(40, 30);
const FIELDS = { title: "Portail", body: "Code 1234" };

function scene(role: CompanyRole | null = "owner", archived: readonly string[] = []) {
  const log: string[] = [];
  const sequence: string[] = [];
  const procedures = new InMemoryProcedures(log, sequence);
  const store = new InMemoryStore(log);
  const events = new RecordingPublisher();
  const deps = [
    membership(role),
    addressBook(archived.includes(ADDRESS) ? [] : [ADDRESS], archived),
    procedures,
    new RecordingLock(sequence),
    store,
    new FixedIdGenerator(),
    new DirectUnitOfWork(),
    events,
  ] as const;
  return {
    events,
    log,
    sequence,
    procedures,
    store,
    add: new AddDeliveryStepHandler(...deps),
    revise: new ReviseDeliveryStepHandler(...deps),
    remove: new RemoveDeliveryStepHandler(...deps),
    reorder: new ReorderDeliveryStepsHandler(...deps),
  };
}

type Scene = ReturnType<typeof scene>;

function addCommand(photo: Buffer | null = PHOTO, title = FIELDS.title): AddDeliveryStepCommand {
  return new AddDeliveryStepCommand("u1", COMPANY, ADDRESS, { ...FIELDS, title }, photo);
}

function reviseCommand(
  stepId: string,
  removePhoto: boolean,
  photo: Buffer | null,
): ReviseDeliveryStepCommand {
  return new ReviseDeliveryStepCommand("u1", COMPANY, ADDRESS, stepId, FIELDS, removePhoto, photo);
}

/** La clé de photo écrite pour l'étape, telle que la base la porte. */
function photoKeyOf(current: Scene, stepId: string): string | null | undefined {
  return current.procedures.state()?.steps.find((step) => step.id === stepId)?.photoKey;
}

describe("ajouter une étape", () => {
  it("range la photo, PUIS écrit la procédure qui pointe vers elle", async () => {
    const current = scene();
    const stepId = await current.add.execute(addCommand());

    const key = photoKeyOf(current, stepId);
    expect(key).toMatch(
      new RegExp(`^companies/${COMPANY}/delivery-procedures/${ADDRESS}/${stepId}-`),
    );
    expect(current.store.objects.get(key ?? "")?.contentType).toBe("image/png");
    expect(current.log).toEqual([`store:save:${key ?? ""}`, "procedure:save"]);
  });

  it("ajoute sans photo, en fin de procédure", async () => {
    const current = scene();
    const first = await current.add.execute(addCommand(null, "Portail"));
    const second = await current.add.execute(addCommand(null, "Cour"));
    expect(current.procedures.state()?.steps.map((step) => step.id)).toEqual([first, second]);
    expect(current.store.objects.size).toBe(0);
  });

  it.each<[string, CompanyRole | null, new (...args: never[]) => Error]>([
    ["un simple membre (403)", "orders", CompanyAdminRequiredError],
    ["un non-membre (404)", null, CompanyNotFoundError],
  ])("refuse %s, sans rien ranger", async (_, role, error) => {
    const current = scene(role);
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(error);
    expect(current.log).toEqual([]);
  });

  it("refuse une adresse archivée comme une adresse inconnue, sans rien ranger", async () => {
    const current = scene("owner", [ADDRESS]);
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      CompanyAddressNotFoundError,
    );
    expect(current.log).toEqual([]);
  });

  it("refuse une photo qui n'est pas une image AVANT de toucher au stockage", async () => {
    const current = scene();
    await expect(
      current.add.execute(addCommand(Buffer.from("%PDF-1.4", "latin1"))),
    ).rejects.toBeInstanceOf(InvalidDeliveryStepPhotoError);
    expect(current.log).toEqual([]);
  });

  it("retire la photo neuve quand l'écriture échoue — la base ne pointe jamais vers rien", async () => {
    const current = scene();
    current.procedures.failSave = true;
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      DocumentStorageUnavailableError,
    );
    expect(current.store.objects.size).toBe(0);
  });

  it("retire la photo neuve quand la procédure est pleine (409)", async () => {
    const current = scene();
    for (let index = 0; index < 20; index += 1) {
      await current.add.execute(addCommand(null, `Étape ${index}`));
    }
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      DeliveryProcedureFullError,
    );
    expect(current.store.objects.size).toBe(0);
  });
});

describe("refaire une étape", () => {
  async function withPhotoStep(): Promise<{ current: Scene; stepId: string; oldKey: string }> {
    const current = scene();
    const stepId = await current.add.execute(addCommand());
    current.log.length = 0;
    return { current, stepId, oldKey: photoKeyOf(current, stepId) ?? "" };
  }

  it("remplace la photo : range la neuve, écrit, PUIS supprime l'ancienne", async () => {
    const { current, stepId, oldKey } = await withPhotoStep();
    await current.revise.execute(reviseCommand(stepId, false, pngOf(10, 10)));

    const newKey = photoKeyOf(current, stepId) ?? "";
    expect(newKey).not.toBe(oldKey);
    expect(current.log).toEqual([
      `store:save:${newKey}`,
      "procedure:save",
      `store:delete:${oldKey}`,
    ]);
  });

  it("retire la photo et la supprime du stockage après l'écriture", async () => {
    const { current, stepId, oldKey } = await withPhotoStep();
    await current.revise.execute(reviseCommand(stepId, true, null));
    expect(photoKeyOf(current, stepId)).toBeNull();
    expect(current.log).toEqual(["procedure:save", `store:delete:${oldKey}`]);
  });

  it("garde la photo quand on ne change que le texte", async () => {
    const { current, stepId, oldKey } = await withPhotoStep();
    await current.revise.execute(reviseCommand(stepId, false, null));
    expect(photoKeyOf(current, stepId)).toBe(oldKey);
    expect(current.log).toEqual(["procedure:save"]);
  });

  it("refuse « retirer » ET une photo jointe, avant tout geste (400)", async () => {
    const { current, stepId } = await withPhotoStep();
    await expect(current.revise.execute(reviseCommand(stepId, true, PHOTO))).rejects.toBeInstanceOf(
      DeliveryStepPhotoIntentError,
    );
    expect(current.log).toEqual([]);
  });

  it("réussit même si l'ancienne photo ne part pas du stockage", async () => {
    const { current, stepId, oldKey } = await withPhotoStep();
    current.store.failDelete = true;
    await expect(
      current.revise.execute(reviseCommand(stepId, false, pngOf(10, 10))),
    ).resolves.toBeUndefined();
    expect(photoKeyOf(current, stepId)).not.toBe(oldKey);
  });

  it("refuse une étape inconnue (404) et retire la photo qu'on venait de ranger", async () => {
    const { current } = await withPhotoStep();
    const before = current.store.objects.size;
    await expect(
      current.revise.execute(reviseCommand("ghost", false, pngOf(10, 10))),
    ).rejects.toBeInstanceOf(DeliveryStepNotFoundError);
    expect(current.store.objects.size).toBe(before);
  });
});

describe("supprimer une étape", () => {
  it("supprime l'étape, PUIS sa photo du stockage", async () => {
    const current = scene();
    const stepId = await current.add.execute(addCommand());
    const key = photoKeyOf(current, stepId) ?? "";
    current.log.length = 0;

    await current.remove.execute(new RemoveDeliveryStepCommand("u1", COMPANY, ADDRESS, stepId));
    expect(current.procedures.state()?.steps).toEqual([]);
    expect(current.log).toEqual(["procedure:save", `store:delete:${key}`]);
  });

  it("refuse un simple membre (403)", async () => {
    const current = scene("orders");
    await expect(
      current.remove.execute(new RemoveDeliveryStepCommand("u1", COMPANY, ADDRESS, "s1")),
    ).rejects.toBeInstanceOf(CompanyAdminRequiredError);
  });

  it("répond 404 sur une adresse sans procédure", async () => {
    const current = scene();
    await expect(
      current.remove.execute(new RemoveDeliveryStepCommand("u1", COMPANY, ADDRESS, "s1")),
    ).rejects.toBeInstanceOf(DeliveryStepNotFoundError);
  });
});

describe("réordonner", () => {
  it("écrit le nouvel ordre", async () => {
    const current = scene();
    const first = await current.add.execute(addCommand(null, "Portail"));
    const second = await current.add.execute(addCommand(null, "Cour"));
    await current.reorder.execute(
      new ReorderDeliveryStepsCommand("u1", COMPANY, ADDRESS, [second, first]),
    );
    expect(current.procedures.state()?.steps.map((step) => step.id)).toEqual([second, first]);
  });

  it("refuse un ordre périmé (409)", async () => {
    const current = scene();
    const first = await current.add.execute(addCommand(null, "Portail"));
    await current.add.execute(addCommand(null, "Cour"));
    await expect(
      current.reorder.execute(new ReorderDeliveryStepsCommand("u1", COMPANY, ADDRESS, [first])),
    ).rejects.toBeInstanceOf(DeliveryProcedureOrderStaleError);
  });

  it("refuse l'ordre d'une adresse sans procédure (409), sans rien écrire", async () => {
    const current = scene();
    await expect(
      current.reorder.execute(new ReorderDeliveryStepsCommand("u1", COMPANY, ADDRESS, ["s1"])),
    ).rejects.toBeInstanceOf(DeliveryProcedureOrderStaleError);
    expect(current.log).toEqual([]);
  });
});

/**
 * Régression : deux ajouts simultanés chargeaient chacun la procédure d'avant,
 * et le second `save` — qui supprime les étapes absentes — effaçait l'étape du
 * premier (corrigé le 2026-09-15 par le verrou de procédure).
 */
describe("le verrou de procédure", () => {
  const LOCK = `lock:${COMPANY}/${ADDRESS}`;
  const LOAD = `load:${COMPANY}/${ADDRESS}`;

  it("est pris AVANT le chargement, pour chacun des quatre gestes", async () => {
    const current = scene();
    const stepId = await current.add.execute(addCommand());
    await current.revise.execute(reviseCommand(stepId, false, null));
    await current.reorder.execute(
      new ReorderDeliveryStepsCommand("u1", COMPANY, ADDRESS, [stepId]),
    );
    await current.remove.execute(new RemoveDeliveryStepCommand("u1", COMPANY, ADDRESS, stepId));
    expect(current.sequence).toEqual([LOCK, LOAD, LOCK, LOAD, LOCK, LOAD, LOCK, LOAD]);
  });

  it("n'est pas pris quand le mur refuse", async () => {
    const current = scene("orders");
    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      CompanyAdminRequiredError,
    );
    expect(current.sequence).toEqual([]);
  });
});

/**
 * Le gestionnaire écrit le même fait que l'agent (depuis le 2026-09-19) : le
 * geste et l'adresse, jamais le contenu d'une étape — un titre peut porter un
 * code de portail.
 */
describe("le journal des gestes du gestionnaire", () => {
  it("un fait par geste, sans le contenu de l'étape", async () => {
    const current = scene();
    const first = await current.add.execute(addCommand(null, "Portail"));
    const second = await current.add.execute(addCommand(null, "Cour"));
    await current.revise.execute(reviseCommand(first, false, null));
    await current.reorder.execute(
      new ReorderDeliveryStepsCommand("u1", COMPANY, ADDRESS, [second, first]),
    );
    await current.remove.execute(new RemoveDeliveryStepCommand("u1", COMPANY, ADDRESS, second));

    expect(current.events.traced.map((event) => event.journalFact().payload)).toEqual(
      ["step_added", "step_added", "step_revised", "reordered", "step_removed"].map((action) => ({
        companyId: COMPANY,
        addressId: ADDRESS,
        action,
      })),
    );
    expect(current.events.factTypes()).toEqual(
      Array.from({ length: 5 }, () => "company.delivery_procedure_edited"),
    );
    expect(JSON.stringify(current.events.traced.map((event) => event.journalFact()))).not.toContain(
      FIELDS.body,
    );
  });

  it("un geste refusé par le mur n'écrit aucun fait", async () => {
    const current = scene("orders");

    await expect(current.add.execute(addCommand())).rejects.toBeInstanceOf(
      CompanyAdminRequiredError,
    );
    expect(current.events.traced).toHaveLength(0);
  });
});
