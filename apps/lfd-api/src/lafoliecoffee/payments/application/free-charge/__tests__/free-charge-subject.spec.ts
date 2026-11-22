import type { SubjectRefundPosition } from "../../../../../payment/channels/requests/index.js";
import type { SubjectRefundOutcome } from "../../../../../payment/channels/subjects/index.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PaymentLink } from "../../../domain/entities/payment-link.js";
import { PaymentLinkNotFoundError } from "../../../domain/errors/payment-link-errors.js";
import { PaymentLinkTerms } from "../../../domain/value-objects/payment-link-terms.js";
import {
  InMemoryPaymentLinks,
  KnownCompanies,
  RecordingNotifier,
} from "../../commands/__tests__/payment-link-doubles.js";
import { PaymentLinkBell } from "../../payment-link-bell.js";
import { FreeChargeLinkable } from "../free-charge-linkable.js";
import { FreeChargeRefundOutcomes } from "../free-charge-refund-outcomes.js";
import { FreeChargeSettlement } from "../free-charge-settlement.js";

/** Des instants recopiés, jamais comparés à l'horloge. */
const CREATED = new Date("2026-01-10T09:00:00.000Z");
const NOW = new Date("2026-01-10T10:00:00.000Z");
const SUBJECT = { type: "free_charge", id: "pl_1" };
const COMPANIES = new KnownCompanies({ co_1: "Les Halles" });

async function scene() {
  const links = new InMemoryPaymentLinks();
  await links.save(
    PaymentLink.create({
      id: "pl_1",
      companyId: "co_1",
      terms: PaymentLinkTerms.create(12_000, "Régularisation août", null),
      nature: "regularization",
      createdAt: CREATED,
      createdByStaffId: "staff_1",
    }),
  );
  const notifier = new RecordingNotifier();
  const journal = new RecordingJournal();
  const clock = new FixedClock(NOW);
  const bell = new PaymentLinkBell(notifier, COMPANIES, clock);
  const settlement = new FreeChargeSettlement(
    links,
    bell,
    new FreeChargeRefundOutcomes(journal, COMPANIES, bell),
    clock,
  );
  const linkable = new FreeChargeLinkable(links, COMPANIES);
  const cancel = async () => {
    const link = await links.load("pl_1");
    link?.cancel(NOW, "staff_2");
    if (link !== null) {
      await links.save(link);
    }
  };
  return { links, notifier, journal, settlement, linkable, cancel };
}

describe("FreeChargeLinkable — le devis de la page", () => {
  it("payable tant qu'elle est ouverte : montant, libellé, société, origine, sans échéance", async () => {
    const { linkable } = await scene();
    expect(await linkable.quote(SUBJECT)).toEqual({
      payable: true,
      amountCents: 12_000,
      payeeName: "La Folie Coffee",
      payerName: "Les Halles",
      reference: "Régularisation août",
      dueOn: null,
    });
  });

  it("annulée : non payable, `cancelled` ; payée : `settled`", async () => {
    const { linkable, settlement, cancel } = await scene();
    await cancel();
    expect(await linkable.quote(SUBJECT)).toEqual({ payable: false, reason: "cancelled" });
    await settlement.onPaid(SUBJECT);
    expect(await linkable.quote(SUBJECT)).toEqual({ payable: false, reason: "settled" });
  });

  it("refuse une demande de paiement libre inconnue", async () => {
    const { linkable } = await scene();
    await expect(linkable.quote({ type: "free_charge", id: "pl_x" })).rejects.toBeInstanceOf(
      PaymentLinkNotFoundError,
    );
  });
});

describe("FreeChargeSettlement — les dix membres", () => {
  it("encaissée : `applied`, la ligne passe à payée ; rejouée : `already_applied`", async () => {
    const { links, settlement, notifier } = await scene();
    expect(await settlement.onPaid(SUBJECT)).toBe("applied");
    expect(await settlement.onPaid(SUBJECT)).toBe("already_applied");
    expect(links.rows.get("pl_1")).toMatchObject({ status: "paid", paidAt: NOW });
    expect(notifier.notices).toEqual([]);
  });

  it("🔴 payée après annulation : `applied`, l'argent gardé, et la cloche sonne", async () => {
    const { links, settlement, notifier, cancel } = await scene();
    await cancel();
    expect(await settlement.isCancelled(SUBJECT)).toBe(true);

    expect(await settlement.onPaid(SUBJECT)).toBe("applied");

    expect(links.rows.get("pl_1")).toMatchObject({ status: "paid", cancelledAt: NOW });
    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: "payment_link.paid_after_cancel",
        idempotencyKey: "notification:payment_link.paid_after_cancel:pl_1",
      }),
    ]);
  });

  it("isCancelled dit la vérité : faux ouverte, vrai annulée", async () => {
    const { settlement, cancel } = await scene();
    expect(await settlement.isCancelled(SUBJECT)).toBe(false);
    await cancel();
    expect(await settlement.isCancelled(SUBJECT)).toBe(true);
  });

  it("refusée par la banque : rien ne bouge, le client réessaie", async () => {
    const { links, settlement } = await scene();
    const savesBefore = links.saves;
    await settlement.onPaymentFailed();
    expect(links.saves).toBe(savesBefore);
    expect(links.rows.get("pl_1")?.status).toBe("open");
  });

  it("une demande d'avant le registre des natures se décrit « Paiement libre — <libellé> »", async () => {
    const { links, settlement } = await scene();
    const row = links.rows.get("pl_1");
    expect(row).toBeDefined();
    if (row !== undefined) {
      links.rows.set("pl_1", { ...row, nature: null });
    }
    expect((await settlement.describe(SUBJECT)).label).toBe("Paiement libre — Régularisation août");
  });

  it("se décrit par sa nature et son libellé, et l'écran des liens ; prend le verrou de sa ligne", async () => {
    const { settlement } = await scene();
    expect(await settlement.describe(SUBJECT)).toEqual({
      label: "Régularisation — Régularisation août",
      link: "/comptabilite/liens-de-paiement",
    });
    await expect(settlement.lockSubject(SUBJECT)).resolves.toBeUndefined();
    await expect(
      settlement.lockSubject({ type: "free_charge", id: "pl_x" }),
    ).rejects.toBeInstanceOf(PaymentLinkNotFoundError);
  });

  it("ne réclame aucune intention d'avant le bloc", async () => {
    const { settlement } = await scene();
    expect(await settlement.claim()).toBeNull();
    expect(await settlement.referencesSince()).toEqual([]);
  });
});

/** La position recalculée, telle que `payment` la passe après un constat. */
const POSITION: SubjectRefundPosition = {
  subject: SUBJECT,
  chargedCents: 12_000,
  refundedCents: 4_000,
  refundedByNature: { return: 4_000, adjustment: 0, unattributed: 0 },
  inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
};
const BASE = { requestId: null, position: POSITION } as const;

describe("FreeChargeSettlement.onRefundOutcome — un remboursement rattaché", () => {
  it("un remboursement réussi va au journal de la société, sans changer l'état", async () => {
    const { links, settlement, journal, notifier } = await scene();
    await settlement.onPaid(SUBJECT);
    await settlement.onRefundOutcome(SUBJECT, {
      ...BASE,
      kind: "succeeded",
      refundId: "rf_1",
      providerRef: "re_1",
      amountCents: 4_000,
      currency: "eur",
    });
    expect(journal.facts).toEqual([
      {
        type: "payment_link.refunded",
        subjectType: "company",
        subjectId: "co_1",
        payload: {
          subjectLabel: "Les Halles",
          paymentLink: { id: "pl_1", name: "Régularisation août" },
          amountCents: 4_000,
          refundedCents: 4_000,
          status: "succeeded",
        },
      },
    ]);
    expect(links.rows.get("pl_1")?.status).toBe("paid");
    expect(notifier.notices).toEqual([]);
  });

  it("un remboursement échoué est noté ET sonne, une fois par remboursement", async () => {
    const { settlement, journal, notifier } = await scene();
    const failed: SubjectRefundOutcome = {
      ...BASE,
      kind: "failed",
      refundId: "rf_2",
      providerRef: "re_2",
      amountCents: 4_000,
      currency: "eur",
      status: "failed",
    };
    await settlement.onRefundOutcome(SUBJECT, failed);
    expect(journal.facts.map((fact) => fact.payload["status"])).toEqual(["failed"]);
    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: "payment_link.refund_failed",
        idempotencyKey: "notification:payment_link.refund_failed:rf_2",
      }),
    ]);
  });

  it("un essai d'émission raté sonne sans journal ; une émission acceptée ne fait rien", async () => {
    const { settlement, journal, notifier } = await scene();
    await settlement.onRefundOutcome(SUBJECT, {
      ...BASE,
      kind: "attempted",
      generation: 1,
      failure: "card_declined",
      providerRef: null,
    });
    await settlement.onRefundOutcome(SUBJECT, {
      ...BASE,
      kind: "issued",
      generation: 2,
      providerRef: "re_3",
      announcedCents: 1,
      issuedCents: 1,
    });
    expect(journal.facts).toEqual([]);
    expect(notifier.notices).toHaveLength(1);
  });
});
