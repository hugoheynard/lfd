import type { Clock } from "../../../../../platform/time/clock.js";
import type { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import {
  MandateNotFoundError,
  MandateNotSignableError,
  MandateAcceptanceInFutureError,
} from "../../../domain/errors/mandate-errors.js";
import { PaymentMandate, type MandateSnapshot } from "../../../domain/entities/payment-mandate.js";
import type { PaymentMandateRepository } from "../../../domain/payment-mandate.repository.js";
import { SignMandateCommand } from "../sign-mandate.command.js";
import { SignMandateHandler } from "../sign-mandate.handler.js";

const NOW = new Date("2026-09-12T09:00:00.000Z");
/** Le papier revient signé neuf jours après l'envoi — le cas ordinaire. */
const ON_PAPER = "2026-09-03";

function snapshot(overrides: Partial<MandateSnapshot>): MandateSnapshot {
  return {
    id: "mdt_draft",
    companyId: "cmp_1",
    stripeCustomerId: null,
    paymentMethodId: null,
    reference: "LFC-9P2X4B-260912-K7M3QT",
    last4: "",
    bankCode: "",
    country: "",
    status: "draft",
    acceptedAt: null,
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    creditorId: "ent_1",
    ...overrides,
  };
}

function build(options: {
  readonly target?: PaymentMandate | null;
  readonly current?: PaymentMandate | null;
}) {
  const saved: PaymentMandate[] = [];
  const mandates: PaymentMandateRepository = {
    findById: () => Promise.resolve(options.target ?? null),
    findCurrent: () => Promise.resolve(options.current ?? null),
    findDraft: () => Promise.resolve(null),
    findAwaitingProof: () => Promise.resolve(null),
    create: () => Promise.resolve("x"),
    save: (mandate) => {
      saved.push(mandate);
      return Promise.resolve();
    },
    findHolder: () => Promise.resolve(null),
    findStripeCustomerId: () => Promise.resolve(null),
  };
  const clock: Clock = { now: () => NOW };
  const uow: UnitOfWork = { run: (work) => work() } as UnitOfWork;
  return { handler: new SignMandateHandler(mandates, clock, uow), saved };
}

describe("SignMandateHandler", () => {
  it("active le brouillon avec la date du PAPIER", async () => {
    const draft = PaymentMandate.reconstitute(snapshot({}));
    const { handler, saved } = build({ target: draft, current: draft });

    await handler.execute(new SignMandateCommand("cmp_1", "mdt_draft", ON_PAPER));

    expect(draft.status).toBe("active");
    expect(draft.acceptedAt?.getDate()).toBe(3);
    expect(saved).toContain(draft);
  });

  /**
   * 🔴 L'invariant du lot. L'index partiel n'autorise qu'un actif par (société,
   * créancier) : signer sans révoquer l'ancien lèverait une violation de
   * contrainte remontée en 500, sur le geste « le client a renvoyé son mandat ».
   */
  it("révoque l'ancien actif dans la même écriture", async () => {
    const draft = PaymentMandate.reconstitute(snapshot({}));
    const active = PaymentMandate.reconstitute(
      snapshot({ id: "mdt_vieux", status: "active", acceptedAt: new Date("2024-01-01") }),
    );
    const { handler, saved } = build({ target: draft, current: active });

    await handler.execute(new SignMandateCommand("cmp_1", "mdt_draft", ON_PAPER));

    expect(active.status).toBe("revoked");
    expect(saved).toHaveLength(2);
  });

  it("ne révoque rien quand il n'y avait pas d'actif", async () => {
    const draft = PaymentMandate.reconstitute(snapshot({}));
    const { handler, saved } = build({ target: draft, current: draft });

    await handler.execute(new SignMandateCommand("cmp_1", "mdt_draft", ON_PAPER));

    expect(saved).toHaveLength(1);
  });

  /**
   * 🔴 Le mur tenant. Sans ce contrôle, un identifiant deviné suffirait à signer
   * le mandat d'un autre client depuis la fiche du sien : le `companyId` de
   * l'URL ne prouve rien à lui seul.
   */
  it("refuse un mandat qui appartient à une autre société", async () => {
    const other = PaymentMandate.reconstitute(snapshot({ companyId: "cmp_autre" }));
    const { handler, saved } = build({ target: other });

    await expect(
      handler.execute(new SignMandateCommand("cmp_1", "mdt_draft", ON_PAPER)),
    ).rejects.toThrow(MandateNotFoundError);
    expect(saved).toHaveLength(0);
  });

  it("refuse un mandat qui n'est pas un brouillon", async () => {
    const active = PaymentMandate.reconstitute(
      snapshot({ status: "active", acceptedAt: new Date("2024-01-01") }),
    );
    const { handler } = build({ target: active });

    await expect(
      handler.execute(new SignMandateCommand("cmp_1", "mdt_draft", ON_PAPER)),
    ).rejects.toThrow(MandateNotSignableError);
  });

  it("refuse une date de signature à venir", async () => {
    const draft = PaymentMandate.reconstitute(snapshot({}));
    const { handler } = build({ target: draft });

    await expect(
      handler.execute(new SignMandateCommand("cmp_1", "mdt_draft", "2026-12-25")),
    ).rejects.toThrow(MandateAcceptanceInFutureError);
  });
});
