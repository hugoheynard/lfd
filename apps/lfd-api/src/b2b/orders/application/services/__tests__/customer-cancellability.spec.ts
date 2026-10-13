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
  readonly open?: boolean;
}) {
  const order = cancellationSubject({ serviceDay: SERVICE_DAY, ...options.order });
  return new CustomerCancellability(
    new FixedSubjects(order),
    new FixedInscriptions(options.inscribed === undefined ? {} : { ord_1: options.inscribed }),
    new CancellationRule(new ScriptedEngagements({ kind: "free" })),
    new CustomerCancellationPolicyGate(
      new FixedCancellationSettings({ openToB2c: options.open ?? true, hoursBefore: 24 }),
    ),
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

  it("un pro : pas d'échéance, réglage fermé ou non", async () => {
    const pro = customerSubject({ companyId: "co_1", serviceDay: SERVICE_DAY });
    expect(await serviceOf({ open: false }).of(pro, NOW, true)).toMatchObject({
      cancellable: true,
      until: null,
    });
  });

  it("inscrite au fournil : « en préparation », même réglage fermé (la raison durable d'abord)", async () => {
    expect(
      await serviceOf({ inscribed: SERVICE_DAY, open: false }).of(PERSONAL, NOW, true),
    ).toEqual({
      cancellable: false,
      code: "in_preparation",
      until: null,
    });
  });

  it("réglage fermé : `closed`", async () => {
    expect(await serviceOf({ open: false }).of(PERSONAL, NOW, true)).toMatchObject({
      cancellable: false,
      code: "closed",
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
});
