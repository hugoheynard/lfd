import { Buffer } from "node:buffer";

import { FixedSitePrincipals } from "../../../../account/application/commands/__tests__/site-gesture-doubles.js";
import { RecordingDurable } from "../../../../account/application/commands/__tests__/durable-doubles.js";
import { SiteGesturePublisher } from "../../../../account/application/services/site-gesture.publisher.js";
import {
  BANK_ACCOUNT_CHANGED,
  MANDATE_PROOF_ATTACHED,
  type GestureActor,
} from "../../../../account/domain/events/site-gesture.fact.js";
import type { LockedPrincipal } from "../../../../account/domain/ports/site-principal.lock.js";
import { AesGcmFieldCipher } from "../../../../../platform/crypto/aes-gcm-field-cipher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  IBAN,
  InMemoryBankAccounts,
  InMemoryMandates,
  mandate,
  MemoryStore,
  PDF,
  RecordingNotifier,
  RIB_PAYLOAD,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { attachProofToDraft } from "../../mandate-proof-support.js";
import { recordCompanyBankAccount } from "../record-company-bank-account.js";

/**
 * N4d (`plan-notifications-sous-comptes.md`) : le RIB et la preuve de mandat
 * écrivent un fait durable par geste, principal lu sous le verrou de la ligne
 * du site DANS l'unité de travail — ces gestes n'en prenaient aucun.
 */
class LoggedLock extends FixedSitePrincipals {
  constructor(
    private readonly steps: Steps,
    principals: ReadonlyMap<string, string>,
  ) {
    super(principals);
  }

  override lockedPrincipalOf(companyId: string): Promise<LockedPrincipal | null> {
    this.steps.log.push("lock:principal");
    return super.lockedPrincipalOf(companyId);
  }
}

const CUSTOMER: GestureActor = { kind: "customer", userId: "u1" };
const TEAM: GestureActor = { kind: "team" };

function harness(principals: ReadonlyMap<string, string> = new Map([["cmp_1", "alpes"]])) {
  const steps = new Steps();
  const durable = new RecordingDurable();
  const mandates = new InMemoryMandates(steps);
  const gestures = new SiteGesturePublisher(
    new LoggedLock(steps, principals),
    new FixedIdGenerator("g"),
    durable,
  );
  const common = {
    mandates,
    clock: new FixedClock(new Date("2026-09-19T09:00:00.000Z")),
    events: new StepPublisher(steps),
    uow: new StepUnitOfWork(steps),
    store: new MemoryStore(steps),
    gestures,
  };
  return {
    steps,
    durable,
    mandates,
    bank: {
      ...common,
      accounts: new InMemoryBankAccounts(steps),
      ids: new FixedIdGenerator("cba"),
      notifier: new RecordingNotifier(steps),
    },
    proof: { ...common, cipher: new AesGcmFieldCipher(Buffer.alloc(32, 9)) },
  };
}

/** Le principal est lu entre l'ouverture et la fermeture de l'unité de travail. */
function lockedInsideUnit(log: readonly string[]): boolean {
  const lock = log.indexOf("lock:principal");
  return lock > log.indexOf("uow:begin") && lock < log.lastIndexOf("uow:end");
}

describe("le RIB et la preuve de mandat écrivent un fait durable (N4d)", () => {
  it("RIB par le client : `company.bank_account_changed`, principal sous verrou, auteur le client", async () => {
    const h = harness();
    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, CUSTOMER, h.bank);

    expect(h.durable.facts.map((fact) => fact.type)).toEqual([BANK_ACCOUNT_CHANGED]);
    expect(h.durable.facts[0]?.payload).toMatchObject({
      siteCompanyId: "cmp_1",
      principalCompanyId: "alpes",
      authorUserId: "u1",
      byTeam: false,
    });
    expect(lockedInsideUnit(h.steps.log)).toBe(true);
  });

  it("RIB par l'équipe : auteur nul, `byTeam`", async () => {
    const h = harness();
    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, TEAM, h.bank);
    expect(h.durable.facts[0]?.payload).toMatchObject({ authorUserId: null, byTeam: true });
  });

  it("ne porte ni IBAN, ni ses derniers caractères, ni titulaire, ni BIC", async () => {
    const h = harness();
    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, CUSTOMER, h.bank);
    const written = JSON.stringify(h.durable.facts);
    for (const secret of [IBAN, IBAN.slice(-4), RIB_PAYLOAD.holder, RIB_PAYLOAD.bic]) {
      expect(written).not.toContain(secret);
    }
  });

  it("une requête rejouée fait deux faits : deux avis valent mieux que zéro (assumé)", async () => {
    const h = harness();
    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, CUSTOMER, h.bank);
    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, CUSTOMER, h.bank);
    expect(new Set(h.durable.facts.map((fact) => fact.key)).size).toBe(2);
  });

  it("preuve de mandat, client puis équipe : `payment_mandate.proof_attached`, sans nom de fichier", async () => {
    const h = harness();
    h.mandates.draft = mandate();
    await attachProofToDraft(h.proof, {
      companyId: "cmp_1",
      fileName: "mandat-signe.pdf",
      bytes: PDF,
      actor: CUSTOMER,
    });
    await attachProofToDraft(h.proof, {
      companyId: "cmp_1",
      fileName: "mandat-signe.pdf",
      bytes: PDF,
      actor: TEAM,
    });

    expect(h.durable.facts.map((fact) => fact.type)).toEqual([
      MANDATE_PROOF_ATTACHED,
      MANDATE_PROOF_ATTACHED,
    ]);
    expect(h.durable.facts.map((fact) => fact.payload["byTeam"])).toEqual([false, true]);
    expect(JSON.stringify(h.durable.facts)).not.toContain("mandat-signe.pdf");
    expect(lockedInsideUnit(h.steps.log)).toBe(true);
  });

  it("un site sans principal : le fait part, principal nul", async () => {
    const h = harness(new Map());
    await recordCompanyBankAccount("cmp_1", RIB_PAYLOAD, CUSTOMER, h.bank);
    expect(h.durable.facts[0]?.payload["principalCompanyId"]).toBeNull();
  });
});
