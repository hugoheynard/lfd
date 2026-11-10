import {
  CancellationReasonRequiredError,
  CancellationReasonTooLongError,
} from "../../errors/order-cancellation-errors.js";
import { CANCELLATION_REASON_MAX_LENGTH, CancellationReason } from "../cancellation-reason.js";

describe("CancellationReason", () => {
  it("garde le motif, sans ses espaces de bord", () => {
    expect(CancellationReason.of("  Le client a appelé  ").value).toBe("Le client a appelé");
  });

  it.each(["", "   ", "\n\t"])("refuse un motif vide (%j)", (raw) => {
    expect(() => CancellationReason.of(raw)).toThrow(CancellationReasonRequiredError);
  });

  it("accepte la borne, refuse au-delà", () => {
    const atBound = "x".repeat(CANCELLATION_REASON_MAX_LENGTH);

    expect(CancellationReason.of(atBound).value).toBe(atBound);
    expect(() => CancellationReason.of(`${atBound}x`)).toThrow(CancellationReasonTooLongError);
  });

  it("la phrase du refus parle à l'équipe", () => {
    expect(() => CancellationReason.of("")).toThrow("Indiquez pourquoi la commande est annulée.");
  });
});
