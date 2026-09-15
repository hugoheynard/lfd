import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { voidDrafts, writeVoidingDraft } from "../draft-mandate-voiding.js";
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
const PROOF_KEY = "companies/cmp_1/mandates/mdt_1/mandat-signe-1";
const TRIGGER = { cause: "bank_account_changed", via: "staff" } as const;

function harness(proofKey: string | null = PROOF_KEY) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  mandates.draft = mandate(
    proofKey === null ? {} : { proofStorageKey: proofKey, proofFileName: "scan.pdf" },
  );
  const store = new MemoryStore(steps);
  if (proofKey !== null) {
    store.objects.set(proofKey, { bytes: PDF, contentType: "application/octet-stream" });
  }
  const events = new StepPublisher(steps);
  const deps = {
    mandates,
    store,
    events,
    clock: new FixedClock(NOW),
    uow: new StepUnitOfWork(steps),
  };
  const write = () => {
    steps.log.push("write");
    return Promise.resolve();
  };
  return { steps, mandates, store, events, deps, write };
}

describe("writeVoidingDraft — la pièce du brouillon devenu caduc", () => {
  it("purge la pièce APRÈS la validation, et l'écrit au journal", async () => {
    const h = harness();

    const voided = await writeVoidingDraft(h.deps, "cmp_1", TRIGGER, h.write);

    expect(voided?.status).toBe("revoked");
    expect(h.steps.log).toEqual([
      "mandate:find-draft",
      "uow:begin",
      "write",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "uow:end",
      `store:delete:${PROOF_KEY}`,
      "journal:payment_mandate.proof_purged",
    ]);
    expect(h.store.objects.has(PROOF_KEY)).toBe(false);
    expect(h.events.traced.at(-1)?.journalFact().payload).toMatchObject({
      cause: "draft_voided",
    });
  });

  it("ne supprime rien quand le brouillon n'avait pas de pièce", async () => {
    const h = harness(null);

    await writeVoidingDraft(h.deps, "cmp_1", TRIGGER, h.write);

    expect(h.steps.log.some((step) => step.startsWith("store:delete"))).toBe(false);
  });

  it("garde l'écriture quand la suppression échoue, sans fait de purge", async () => {
    const h = harness();
    h.store.failDeletes = true;

    await expect(writeVoidingDraft(h.deps, "cmp_1", TRIGGER, h.write)).resolves.toMatchObject({
      status: "revoked",
    });

    expect(h.store.objects.has(PROOF_KEY)).toBe(true);
    expect(h.events.traced.map((event) => event.journalFact().type)).toEqual([
      "payment_mandate.draft_voided",
    ]);
  });
});

describe("voidDrafts — la transaction n'est pas la sienne", () => {
  /** Plan `plan-restes-du-mandat.md` §7 #10 : la purge part de l'annonce, jamais d'ici. */
  it("rend les brouillons révoqués sans rien supprimer", async () => {
    const h = harness();
    const draft = mandate({ proofStorageKey: PROOF_KEY, proofFileName: "scan.pdf" });

    const voided = await voidDrafts(h.deps, [draft], {
      cause: "mandate_scheme_changed",
      via: "staff",
    });

    expect(voided).toEqual([draft]);
    expect(voided[0]?.purgeableProofKey()).toBe(PROOF_KEY);
    expect(h.steps.log.some((step) => step.startsWith("store:delete"))).toBe(false);
    expect(h.store.objects.has(PROOF_KEY)).toBe(true);
  });
});
