import {
  ChorusRoutingQuoteWithoutMercurialeError,
  ChorusRoutingTimingLockedError,
} from "../../errors/chorus-routing-errors.js";
import { ChorusRouting } from "../../value-objects/chorus-routing.js";
import { ensureCommitmentTimingAccepted } from "../commitment-timing-rule.js";

const AGENT = { staffUserId: "staff_1", name: "Camille", role: "commercial" };
const READING = {
  commitmentRequired: true,
  serviceCodeRequired: false,
  defaultServiceCode: "",
  commitmentTiming: "at_order" as const,
  checkedOn: "2026-11-01",
};
const AT_ORDER = ChorusRouting.record(READING, AGENT);
const ON_QUOTE = ChorusRouting.record({ ...READING, commitmentTiming: "on_period_quote" }, AGENT);
const CLEAR = { liveMercuriale: true, uninvoicedOrders: false };

describe("ensureCommitmentTimingAccepted — le moment de l'engagement (QD1)", () => {
  it("accepte le passage au devis : mercuriale active, tout facturé", () => {
    expect(() => ensureCommitmentTimingAccepted("c1", ON_QUOTE, AT_ORDER, CLEAR)).not.toThrow();
    expect(() => ensureCommitmentTimingAccepted("c1", ON_QUOTE, null, CLEAR)).not.toThrow();
  });

  it("refuse le devis sans mercuriale active", () => {
    expect(() =>
      ensureCommitmentTimingAccepted("c1", ON_QUOTE, AT_ORDER, { ...CLEAR, liveMercuriale: false }),
    ).toThrow(ChorusRoutingQuoteWithoutMercurialeError);
  });

  it("refuse un changement de mode sous une commande non facturée, dans les deux sens", () => {
    const pending = { ...CLEAR, uninvoicedOrders: true };
    expect(() => ensureCommitmentTimingAccepted("c1", ON_QUOTE, AT_ORDER, pending)).toThrow(
      ChorusRoutingTimingLockedError,
    );
    expect(() => ensureCommitmentTimingAccepted("c1", AT_ORDER, ON_QUOTE, pending)).toThrow(
      ChorusRoutingTimingLockedError,
    );
  });

  it("ne refuse rien quand le mode ne change pas", () => {
    const blocked = { liveMercuriale: false, uninvoicedOrders: true };
    expect(() => ensureCommitmentTimingAccepted("c1", AT_ORDER, AT_ORDER, blocked)).not.toThrow();
    expect(() => ensureCommitmentTimingAccepted("c1", AT_ORDER, null, blocked)).not.toThrow();
    expect(() => ensureCommitmentTimingAccepted("c1", ON_QUOTE, ON_QUOTE, blocked)).not.toThrow();
  });
});
