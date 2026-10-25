import type { CustomerCancellationStage } from "@lfd/contracts";

import { CancellationAllowanceGate } from "../cancellation-allowance-gate.js";
import { CancellationRule } from "../cancellation-rule.js";
import { CustomerCancellability } from "../customer-cancellability.js";
import { CustomerCancellationPolicyGate } from "../customer-cancellation-policy.js";
import {
  cancellationSubject,
  FixedInscriptions,
  FixedSubjects,
  ScriptedEngagements,
} from "../../commands/__tests__/cancellation-doubles.js";
import {
  customerSubject,
  FixedCancellationSettings,
} from "../../commands/__tests__/customer-cancellation-doubles.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";

/**
 * L'annulabilité affichée au client (plan, C6.8) : la même règle que le
 * geste, sans verrou, et le réglage pour un particulier. `NOW` n'est comparé
 * qu'aux dates de la fixture, jamais à l'horloge.
 */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));
const SERVICE_DAY = "2030-01-15";

function serviceOf(options: {
  readonly order?: Partial<CancellationSubject>;
  readonly inscribed?: string;
  readonly delay?: boolean;
  readonly stage?: CustomerCancellationStage;
}) {
  const order = cancellationSubject({ serviceDay: SERVICE_DAY, ...options.order });
  const settings = new FixedCancellationSettings({
    delayEnabled: options.delay ?? true,
    hoursBefore: 24,
    b2cCancellableUntil: options.stage ?? "production_plan",
  });
  return new CustomerCancellability(
    new FixedSubjects(order),
    new FixedInscriptions(options.inscribed === undefined ? {} : { ord_1: options.inscribed }),
    new CancellationRule(new ScriptedEngagements({ kind: "free" })),
    new CustomerCancellationPolicyGate(settings),
    new CancellationAllowanceGate(settings),
  );
}

const PERSONAL = customerSubject({ serviceDay: SERVICE_DAY });

describe("CustomerCancellability", () => {
  it("annulable : jusqu'à quand, et rien de prélevé pour une carte non payée", async () => {
    expect(await serviceOf({}).of(PERSONAL, NOW, true)).toEqual({
      cancellable: true,
      until: "2030-01-13T23:00:00.000Z",
      money: { kind: "nothing_charged" },
      voucherReturned: false,
    });
  });

  it("payée : le remboursement annoncé ; un bon : il revient", async () => {
    const view = await serviceOf({
      order: {
        paymentStatus: "paid",
        loyaltyVoucherId: "v_1",
        refunds: { refundableCents: 2_110, inFlightCents: 0 },
      },
    }).of(PERSONAL, NOW, true);
    expect(view).toMatchObject({
      cancellable: true,
      money: { kind: "refund", amountCents: 2_110 },
      voucherReturned: true,
    });
  });

  it("un pro : pas d'échéance, délai imposé ou non", async () => {
    const pro = customerSubject({ companyId: "co_1", serviceDay: SERVICE_DAY });
    expect(await serviceOf({ delay: true }).of(pro, NOW, true)).toMatchObject({
      cancellable: true,
      until: null,
    });
  });

  it("inscrite au fournil : « en préparation », même sans délai imposé", async () => {
    expect(
      await serviceOf({ inscribed: SERVICE_DAY, delay: false }).of(PERSONAL, NOW, true),
    ).toEqual({
      cancellable: false,
      code: "in_preparation",
      until: null,
    });
  });

  /** Décision du 2026-10-13 : sans délai imposé, le particulier annule comme un pro. */
  it("délai désactivé : annulable même au-delà du délai, sans échéance", async () => {
    const late = new Date(Date.UTC(2030, 0, 14, 9));
    expect(await serviceOf({ delay: false }).of(PERSONAL, late, true)).toMatchObject({
      cancellable: true,
      until: null,
    });
  });

  it("trop tard : `too_late`, avec l'échéance passée", async () => {
    const late = new Date(Date.UTC(2030, 0, 14, 9));
    expect(await serviceOf({}).of(PERSONAL, late, true)).toEqual({
      cancellable: false,
      code: "too_late",
      until: "2030-01-13T23:00:00.000Z",
    });
  });

  it("visible mais pas annulable par ce compte : le refus du mur", async () => {
    expect(await serviceOf({}).of(PERSONAL, NOW, "not_allowed")).toMatchObject({
      cancellable: false,
      code: "not_allowed",
    });
  });

  describe("plan A1 — l'aperçu suit le réglage", () => {
    it("« prête » : une commande de retrait inscrite s'annule, à l'aperçu aussi", async () => {
      const preview = await serviceOf({
        inscribed: SERVICE_DAY,
        delay: false,
        stage: "ready",
        order: { fulfillmentMethod: "pickup" },
      }).of(PERSONAL, NOW, true);

      expect(preview).toMatchObject({ cancellable: true });
    });

    it("« prête » : une livraison inscrite reste « en préparation »", async () => {
      const preview = await serviceOf({
        inscribed: SERVICE_DAY,
        delay: false,
        stage: "ready",
        order: { fulfillmentMethod: "delivery" },
      }).of(PERSONAL, NOW, true);

      expect(preview).toEqual({ cancellable: false, code: "in_preparation", until: null });
    });
  });
});
