import {
  CustomerCancellationReasonCodeUnknownError,
  CustomerCancellationReasonTooLongError,
} from "../../errors/customer-cancellation-errors.js";
import { CustomerCancellationReason } from "../customer-cancellation-reason.js";

describe("le motif d'un client (Q-C6.1)", () => {
  it("admet l'absence : ni code, ni texte", () => {
    const reason = CustomerCancellationReason.of(undefined, undefined);
    expect(reason.code).toBeNull();
    expect(reason.text).toBeNull();
  });

  it("traite le vide et les espaces comme une absence", () => {
    const reason = CustomerCancellationReason.of("  ", "   ");
    expect(reason.code).toBeNull();
    expect(reason.text).toBeNull();
  });

  it("garde un code de la liste et un texte rogné", () => {
    const reason = CustomerCancellationReason.of("wrong_date", "  Je me suis trompé de jour  ");
    expect(reason.code).toBe("wrong_date");
    expect(reason.text).toBe("Je me suis trompé de jour");
  });

  it("refuse un code hors de la liste", () => {
    expect(() => CustomerCancellationReason.of("caprice", undefined)).toThrow(
      CustomerCancellationReasonCodeUnknownError,
    );
  });

  it("borne le texte à 500 caractères", () => {
    expect(() => CustomerCancellationReason.of("other", "x".repeat(500))).not.toThrow();
    expect(() => CustomerCancellationReason.of("other", "x".repeat(501))).toThrow(
      CustomerCancellationReasonTooLongError,
    );
  });
});
