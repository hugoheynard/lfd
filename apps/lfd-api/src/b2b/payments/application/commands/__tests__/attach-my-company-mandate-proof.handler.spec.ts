import { Buffer } from "node:buffer";

import { AesGcmFieldCipher } from "../../../../../platform/crypto/aes-gcm-field-cipher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import {
  CustomerMandateClosedError,
  MandateNotFoundError,
  MandateNotProvableError,
} from "../../../domain/errors/mandate-errors.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  activeMandate,
  FixedGate,
  FixedGuard,
  InMemoryMandates,
  mandate,
  MemoryStore,
  PDF,
  RecordingNotifier,
  StepPublisher,
  Steps,
  StepUnitOfWork,
} from "../../__tests__/payment-doubles.js";
import { AttachMyCompanyMandateProofCommand } from "../attach-my-company-mandate-proof.command.js";
import { AttachMyCompanyMandateProofHandler } from "../attach-my-company-mandate-proof.handler.js";

const NOW = new Date("2026-09-14T09:00:00.000Z");
const CIPHER = new AesGcmFieldCipher(Buffer.alloc(32, 7));

function harness(
  options: { readonly role?: BankAccountRole | null; readonly open?: boolean } = {},
) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  const store = new MemoryStore(steps);
  const events = new StepPublisher(steps);
  const notifier = new RecordingNotifier(steps);
  const handler = new AttachMyCompanyMandateProofHandler(
    new FixedGuard(steps, options.role === undefined ? "billing" : options.role),
    new FixedGate(steps, options.open ?? true),
    mandates,
    store,
    CIPHER,
    new FixedClock(NOW),
    events,
    new StepUnitOfWork(steps),
    notifier,
  );
  const run = (bytes: Buffer = PDF) =>
    handler.execute(new AttachMyCompanyMandateProofCommand("usr_1", "cmp_1", "mandat.pdf", bytes));
  return { steps, mandates, store, events, notifier, run };
}

describe("AttachMyCompanyMandateProofHandler — le client renvoie son mandat signé", () => {
  it("range, écrit la pièce ET sa trace ensemble, puis sonne la cloche", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    await h.run();

    expect(h.steps.log).toEqual([
      "guard",
      "gate",
      "mandate:find-draft",
      "store",
      "uow:begin",
      "mandate:deposit",
      "journal:payment_mandate.proof_attached",
      "uow:end",
      "bell",
    ]);
    expect(h.mandates.saved[0]?.proven()).toBe(true);
    expect(h.events.traced[0]?.journalFact().payload).toMatchObject({ via: "customer" });
  });

  it("ne change PAS le statut : le client prouve, il ne s'active pas", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    await h.run();

    expect(h.mandates.saved[0]?.status).toBe("draft");
    expect(h.mandates.saved[0]?.acceptedAt).toBeNull();
  });

  it("annonce à l'équipe le mandat, sa RUM et la fiche, une fois par mandat", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    await h.run();

    expect(h.notifier.notices).toEqual([
      expect.objectContaining({
        kind: "payment_mandate.proof_attached",
        subject: "Mandat signé déposé — Refuge du Col SARL",
        link: "/comptes-clients/cmp_1/informations",
        idempotencyKey: "notification:payment_mandate.proof_attached:mdt_1",
        occurredAt: NOW,
      }),
    ]);
    expect(h.notifier.notices[0]?.body).toContain("LFC-9P2X4B-260914-K7M3QT");
  });

  /** La pièce est rangée et tracée : une cloche en panne n'annule rien. */
  it("garde le dépôt quand la cloche tombe en panne", async () => {
    const h = harness();
    h.mandates.draft = mandate();
    h.notifier.broken = true;

    await expect(h.run()).resolves.toBeUndefined();
    expect(h.mandates.saved[0]?.proven()).toBe(true);
  });

  it.each<BankAccountRole>(["admin", "orders"])(
    "refuse %s en 403, sans rien ranger",
    async (role) => {
      const h = harness({ role });
      h.mandates.draft = mandate();

      await expect(h.run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
      expect(h.store.objects.size).toBe(0);
    },
  );

  it("refuse un non-membre en 404, sans rien ranger", async () => {
    const h = harness({ role: null });
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(h.store.objects.size).toBe(0);
  });

  it("refuse en 409 quand le drapeau est fermé, sans rien ranger", async () => {
    const h = harness({ open: false });
    h.mandates.draft = mandate();

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.store.objects.size).toBe(0);
  });

  /** Plan §6 #2 : le client ne remplace jamais la pièce d'un actif. */
  it("refuse le dépôt sur un mandat ACTIF, sans rien ranger ni sonner", async () => {
    const h = harness();
    h.mandates.current = activeMandate();

    await expect(h.run()).rejects.toBeInstanceOf(MandateNotProvableError);
    expect(h.store.objects.size).toBe(0);
    expect(h.notifier.notices).toHaveLength(0);
  });

  it("refuse en 404 quand il n'y a aucun mandat", async () => {
    const h = harness();

    await expect(h.run()).rejects.toBeInstanceOf(MandateNotFoundError);
    expect(h.store.objects.size).toBe(0);
  });

  it("refuse des octets qui ne sont pas une pièce, sans rien ranger", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    await expect(h.run(Buffer.from("MZ\x90\x00", "latin1"))).rejects.toThrow(/Pièce invalide/u);
    expect(h.store.objects.size).toBe(0);
  });
});
