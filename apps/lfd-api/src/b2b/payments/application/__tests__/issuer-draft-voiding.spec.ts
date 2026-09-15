import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PaymentMandate } from "../../domain/entities/payment-mandate.js";
import { IssuedDraftsReader } from "../../domain/ports/issued-drafts.reader.js";
import { IssuerDraftVoiding } from "../issuer-draft-voiding.js";
import {
  activeMandate,
  InMemoryMandates,
  mandate,
  MemoryStore,
  RecordingNotifier,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "./payment-doubles.js";

const NOW = new Date("2026-09-15T09:00:00.000Z");
const PROOF_KEY = "companies/cmp_1/mandates/mdt_1/mandat-signe-1";

/** Plusieurs mandats par identifiant — le doublé partagé n'en tient que deux. */
class MandatesById extends InMemoryMandates {
  readonly byId = new Map<string, PaymentMandate>();

  override findById(mandateId: string): Promise<PaymentMandate | null> {
    return Promise.resolve(this.byId.get(mandateId) ?? null);
  }
}

class FixedIssuedDrafts extends IssuedDraftsReader {
  constructor(
    private readonly steps: Steps,
    private readonly ids: readonly string[],
  ) {
    super();
  }

  draftIdsIssuedBy(): Promise<readonly string[]> {
    this.steps.log.push("issued:draft-ids");
    return Promise.resolve(this.ids);
  }
}

function harness(stored: readonly PaymentMandate[], ids = stored.map((m) => m.id)) {
  const steps = new Steps();
  const mandates = new MandatesById(steps);
  for (const one of stored) {
    mandates.byId.set(one.id, one);
  }
  const events = new StepPublisher(steps);
  const notifier = new RecordingNotifier(steps);
  const store = new MemoryStore(steps);
  const port = new IssuerDraftVoiding(
    new FixedIssuedDrafts(steps, ids),
    mandates,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
    notifier,
    store,
  );
  return { steps, mandates, events, notifier, store, port };
}

describe("IssuerDraftVoiding — les brouillons d'un émetteur deviennent caducs", () => {
  it("révoque chaque brouillon et journalise sa cause, dans UNE unité de travail", async () => {
    const first = mandate({ id: "mdt_1", companyId: "cmp_1" });
    const second = mandate({ id: "mdt_2", companyId: "cmp_2", reference: "LFC-2" });
    const h = harness([first, second]);

    const voided = await h.port.voidDraftsOf("ent_1", "mandate_scheme_changed", "staff");

    expect(voided).toEqual([
      { id: "mdt_1", companyId: "cmp_1", reference: first.reference },
      { id: "mdt_2", companyId: "cmp_2", reference: "LFC-2" },
    ]);
    expect(h.steps.log).toEqual([
      "issued:draft-ids",
      "uow:begin",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "mandate:save:revoked",
      "journal:payment_mandate.draft_voided",
      "uow:end",
    ]);
    expect(h.events.traced.map((event) => event.journalFact().payload)).toEqual([
      {
        companyId: "cmp_1",
        reference: first.reference,
        cause: "mandate_scheme_changed",
        via: "staff",
      },
      { companyId: "cmp_2", reference: "LFC-2", cause: "mandate_scheme_changed", via: "staff" },
    ]);
    expect(first.toSnapshot()).toMatchObject({ status: "revoked", revokedAt: NOW });
  });

  /** Un actif a figé son schéma : même rendu par erreur, il n'est pas révoqué. */
  it("laisse un mandat ACTIF intact, même si la lecture le désignait", async () => {
    const active = activeMandate({ id: "mdt_actif", creditorId: "ent_1" });
    const h = harness([active]);

    const voided = await h.port.voidDraftsOf("ent_1", "mandate_defaults_changed", "staff");

    expect(voided).toEqual([]);
    expect(active.status).toBe("active");
    expect(h.mandates.saved).toHaveLength(0);
    expect(h.steps.log).toEqual(["issued:draft-ids"]);
  });

  it("n'ouvre aucune transaction quand l'émetteur n'a aucun brouillon", async () => {
    const h = harness([]);

    await expect(h.port.voidDraftsOf("ent_1", "mandate_scheme_changed", "staff")).resolves.toEqual(
      [],
    );
    expect(h.steps.log).toEqual(["issued:draft-ids"]);
  });

  it("sonne une fois par brouillon, avec la cause de l'émetteur", async () => {
    const h = harness([]);

    await h.port.announceVoided(
      [
        { id: "mdt_1", companyId: "cmp_1", reference: "LFC-1" },
        { id: "mdt_2", companyId: "cmp_2", reference: "LFC-2" },
      ],
      "mandate_scheme_changed",
    );

    expect(h.notifier.notices.map((notice) => notice.idempotencyKey)).toEqual([
      "notification:payment_mandate.draft_voided:mdt_1",
      "notification:payment_mandate.draft_voided:mdt_2",
    ]);
    expect(h.notifier.notices[0]?.body).toContain("changé le schéma de ses mandats");
  });

  it("ne fait jamais échouer le geste quand la cloche est en panne", async () => {
    const h = harness([]);
    h.notifier.broken = true;

    await expect(
      h.port.announceVoided(
        [{ id: "mdt_1", companyId: "cmp_1", reference: "LFC-1" }],
        "mandate_defaults_changed",
      ),
    ).resolves.toBeUndefined();
  });

  /** Plan `plan-restes-du-mandat.md` §7 #10 : la purge part de l'annonce, après la transaction. */
  it("ne supprime aucune pièce DANS la transaction du réglage", async () => {
    const draft = mandate({ id: "mdt_1", proofStorageKey: PROOF_KEY, proofFileName: "scan.pdf" });
    const h = harness([draft]);

    await h.port.voidDraftsOf("ent_1", "mandate_scheme_changed", "staff");

    expect(h.steps.log.some((step) => step.startsWith("store:delete"))).toBe(false);
  });

  it("purge à l'annonce la pièce du brouillon révoqué, relu après la transaction", async () => {
    const draft = mandate({ id: "mdt_1", proofStorageKey: PROOF_KEY, proofFileName: "scan.pdf" });
    const h = harness([draft]);
    const voided = await h.port.voidDraftsOf("ent_1", "mandate_scheme_changed", "staff");

    await h.port.announceVoided(voided, "mandate_scheme_changed");

    expect(h.steps.log.slice(-3)).toEqual([
      "bell",
      `store:delete:${PROOF_KEY}`,
      "journal:payment_mandate.proof_purged",
    ]);
  });

  it("garde à l'annonce la pièce d'un mandat qui a été signé", async () => {
    const signed = activeMandate({ id: "mdt_1", proofStorageKey: PROOF_KEY });
    signed.revoke(NOW);
    const h = harness([signed]);

    await h.port.announceVoided(
      [{ id: "mdt_1", companyId: "cmp_1", reference: "LFC-1" }],
      "mandate_defaults_changed",
    );

    expect(h.steps.log.some((step) => step.startsWith("store:delete"))).toBe(false);
  });

  it("ne fait jamais échouer l'annonce quand la suppression échoue", async () => {
    const draft = mandate({ id: "mdt_1", proofStorageKey: PROOF_KEY, proofFileName: "scan.pdf" });
    const h = harness([draft]);
    const voided = await h.port.voidDraftsOf("ent_1", "mandate_scheme_changed", "staff");
    h.store.failDeletes = true;

    await expect(h.port.announceVoided(voided, "mandate_scheme_changed")).resolves.toBeUndefined();
    expect(h.steps.log).not.toContain("journal:payment_mandate.proof_purged");
  });
});
