import { Buffer } from "node:buffer";

import { AesGcmFieldCipher } from "../../../../platform/crypto/aes-gcm-field-cipher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MandateProofChangedError } from "../../domain/errors/mandate-proof-errors.js";
import { attachProofToDraft } from "../mandate-proof-support.js";
import {
  InMemoryMandates,
  mandate,
  MemoryStore,
  PDF,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "./payment-doubles.js";

const NOW = new Date("2026-09-15T09:00:00.000Z");
const CIPHER = new AesGcmFieldCipher(Buffer.alloc(32, 9));
/** La pièce que le brouillon porte avant le dépôt. */
const PREVIOUS_KEY = "companies/cmp_1/mandates/mdt_1/mandat-signe-1";
/** La clé que le dépôt compose : société, mandat, instant. */
const NEW_KEY = `companies/cmp_1/mandates/mdt_1/mandat-signe-${String(NOW.getTime())}`;

function harness(previousKey: string | null = PREVIOUS_KEY) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  mandates.draft = mandate(
    previousKey === null ? {} : { proofStorageKey: previousKey, proofFileName: "v1.pdf" },
  );
  const store = new MemoryStore(steps);
  if (previousKey !== null) {
    store.objects.set(previousKey, { bytes: PDF, contentType: "application/octet-stream" });
  }
  const events = new StepPublisher(steps);
  const deps = {
    mandates,
    store,
    cipher: CIPHER,
    clock: new FixedClock(NOW),
    events,
    uow: new StepUnitOfWork(steps),
  };
  const run = () =>
    attachProofToDraft(deps, { companyId: "cmp_1", fileName: "v2.pdf", bytes: PDF, via: "staff" });
  return { steps, mandates, store, events, run };
}

describe("attachProofToDraft — le scan remplacé d'un brouillon est purgé", () => {
  it("purge l'ancienne pièce APRÈS la validation, puis l'écrit au journal", async () => {
    const h = harness();

    await h.run();

    expect(h.steps.log).toEqual([
      "mandate:find-draft",
      "store",
      "uow:begin",
      "mandate:deposit",
      "journal:payment_mandate.proof_attached",
      "uow:end",
      `store:delete:${PREVIOUS_KEY}`,
      "journal:payment_mandate.proof_purged",
    ]);
    expect(h.store.objects.has(PREVIOUS_KEY)).toBe(false);
    expect(h.store.objects.has(NEW_KEY)).toBe(true);
  });

  it("n'écrit aucune clé de stockage dans le fait de purge", async () => {
    const h = harness();

    await h.run();

    const purged = h.events.traced.map((event) => event.journalFact()).at(-1);
    expect(purged).toMatchObject({
      type: "payment_mandate.proof_purged",
      subjectId: "mdt_1",
      payload: { company: { id: "cmp_1", name: "Le Refuge du Col" }, cause: "proof_replaced" },
    });
    expect(JSON.stringify(purged)).not.toContain("companies/");
  });

  it("ne purge rien au premier dépôt", async () => {
    const h = harness(null);

    await h.run();

    expect(h.steps.log.some((step) => step.startsWith("store:delete"))).toBe(false);
    expect(h.events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.proof_attached",
    ]);
  });

  it("garde le dépôt quand la suppression échoue, sans fait de purge", async () => {
    const h = harness();
    h.store.failDeletes = true;

    await expect(h.run()).resolves.toMatchObject({ id: "mdt_1" });

    expect(h.store.objects.has(PREVIOUS_KEY)).toBe(true);
    expect(h.events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.proof_attached",
    ]);
  });
});

describe("attachProofToDraft — l'écriture de la pièce est conditionnelle", () => {
  /**
   * Régression (plan `plan-restes-du-mandat.md` §7 #3) : `save` écrivait la
   * pièce sans condition. Un client qui redéposait pendant que le staff
   * signait réécrivait le brouillon, puis la purge de l'ancienne clé détruisait
   * le scan du mandat qu'on venait d'activer.
   */
  it("un redépôt concurrent d'une signature ne détruit pas la pièce signée", async () => {
    const h = harness();
    // La signature est passée entre la lecture et l'écriture.
    h.mandates.concurrent = { status: "active", proofStorageKey: PREVIOUS_KEY };

    await expect(h.run()).rejects.toBeInstanceOf(MandateProofChangedError);

    expect(h.store.objects.has(PREVIOUS_KEY)).toBe(true);
    expect(h.steps.log).not.toContain(`store:delete:${PREVIOUS_KEY}`);
  });

  it("retire la pièce neuve que la base ne désignera jamais, sans rien journaliser", async () => {
    const h = harness();
    h.mandates.concurrent = { status: "active", proofStorageKey: PREVIOUS_KEY };

    await expect(h.run()).rejects.toBeInstanceOf(MandateProofChangedError);

    expect(h.store.objects.has(NEW_KEY)).toBe(false);
    expect(h.steps.log.slice(-2)).toEqual(["mandate:deposit-refused", `store:delete:${NEW_KEY}`]);
    expect(h.events.traced).toHaveLength(0);
  });

  it("refuse aussi quand un autre scan a été déposé entre-temps", async () => {
    const h = harness();
    h.mandates.concurrent = {
      status: "draft",
      proofStorageKey: "companies/cmp_1/mandates/mdt_1/mandat-signe-autre",
    };

    await expect(h.run()).rejects.toBeInstanceOf(MandateProofChangedError);

    expect(h.store.objects.has(PREVIOUS_KEY)).toBe(true);
    expect(h.store.objects.has(NEW_KEY)).toBe(false);
  });
});
