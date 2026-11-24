import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import {
  OrderCutoffGraceError,
  PastOrderCutoffError,
  TermsNotGrantedError,
} from "../../../domain/errors/order-errors.js";
import { recurringRefusalOf } from "../recurring-refusal.js";

describe("recurringRefusalOf — un refus de la passation, traduit pour le registre", () => {
  it("l'heure limite passée close l'échéance", () => {
    expect(recurringRefusalOf(new PastOrderCutoffError("2026-12-01"))).toMatchObject({
      cause: "deadline_closed",
      final: true,
    });
  });

  it("sans dérogation, un rattrapage vaut une heure limite passée", () => {
    expect(
      recurringRefusalOf(
        new OrderCutoffGraceError("2026-12-01", new Date("2026-11-30T23:30:00.000Z")),
      ),
    ).toMatchObject({ cause: "deadline_closed", final: true });
  });

  it("un compte sans crédit est un refus qui se rejoue", () => {
    expect(recurringRefusalOf(new TermsNotGrantedError("co_1"))).toMatchObject({
      cause: "no_settlement",
      final: false,
    });
  });

  it("garde la phrase du refus, qui nomme le cas", () => {
    expect(recurringRefusalOf(new UnknownSkuError("PAN-404"))).toEqual({
      cause: "unavailable_sku",
      reason: "Article inconnu au catalogue : PAN-404.",
      final: false,
    });
  });

  it("une erreur technique ou inconnue n'est pas un refus : elle remonte", () => {
    expect(recurringRefusalOf(new Error("connexion perdue"))).toBeNull();
    expect(recurringRefusalOf("boom")).toBeNull();
  });
});
