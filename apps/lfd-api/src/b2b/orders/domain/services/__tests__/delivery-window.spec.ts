import { resolveWindowMode } from "@lfd/contracts";

import {
  DeadlineWindowHasStartError,
  DeliveryWindowRequiredError,
} from "../../errors/order-errors.js";
import { agreeFulfillment } from "../agreed-fulfillment.js";
import { ensureDeliveryWindow, preferredWindowOf } from "../delivery-window.js";

const SLOT = { start: "06:00", end: "08:00" };
const BEFORE_SIX = { start: null, end: "06:00" };

describe("le mode d'une livraison (CA-D2)", () => {
  it("prend celui de l'adresse quand elle le surcharge", () => {
    expect(resolveWindowMode("deadline", "slot")).toBe("deadline");
    expect(resolveWindowMode("slot", "deadline")).toBe("slot");
  });

  it("hérite du global quand l'adresse ne dit rien", () => {
    expect(resolveWindowMode(null, "deadline")).toBe("deadline");
    expect(resolveWindowMode(undefined, "slot")).toBe("slot");
  });
});

describe("la fenêtre proposée par l'adresse", () => {
  it("en créneau, c'est le créneau préféré", () => {
    expect(preferredWindowOf("slot", SLOT, ["06:00"])).toEqual(SLOT);
  });

  it("en échéance, une seule échéance préférée est proposée sans début", () => {
    expect(preferredWindowOf("deadline", SLOT, ["06:00"])).toEqual(BEFORE_SIX);
  });

  it("en échéance, plusieurs échéances ne proposent rien : la commande choisit", () => {
    expect(preferredWindowOf("deadline", null, ["06:00", "11:00"])).toBeNull();
  });
});

describe("la fenêtre d'une livraison", () => {
  it("refuse un début fourni en mode échéance", () => {
    expect(() =>
      ensureDeliveryWindow({ method: "delivery", mode: "deadline", requested: SLOT, agreed: SLOT }),
    ).toThrow(DeadlineWindowHasStartError);
  });

  it("accepte une échéance seule en mode échéance", () => {
    expect(() =>
      ensureDeliveryWindow({
        method: "delivery",
        mode: "deadline",
        requested: BEFORE_SIX,
        agreed: BEFORE_SIX,
      }),
    ).not.toThrow();
  });

  /** CA1b : une livraison sans heure ne se place dans aucune tournée. */
  it("refuse une livraison sans fenêtre, quel que soit le mode", () => {
    for (const mode of ["slot", "deadline"] as const) {
      expect(() =>
        ensureDeliveryWindow({ method: "delivery", mode, requested: undefined, agreed: null }),
      ).toThrow(DeliveryWindowRequiredError);
    }
  });

  it("ne juge pas un retrait", () => {
    expect(() =>
      ensureDeliveryWindow({ method: "pickup", mode: "deadline", requested: SLOT, agreed: null }),
    ).not.toThrow();
  });
});

describe("la provenance contre la liste d'échéances", () => {
  const defaults = {
    contact: null,
    signatureRequired: false,
    window: null,
    deadlines: ["06:00", "11:00"],
  };

  it("une échéance de la liste est une reprise", () => {
    const agreed = agreeFulfillment({ window: { start: null, end: "11:00" } }, defaults);
    expect(agreed.window.source).toBe("default");
  });

  it("une autre heure est un choix", () => {
    const agreed = agreeFulfillment({ window: { start: null, end: "09:00" } }, defaults);
    expect(agreed.window.source).toBe("override");
  });

  it("un créneau qui finit à une échéance de la liste reste un choix", () => {
    const agreed = agreeFulfillment({ window: { start: "10:00", end: "11:00" } }, defaults);
    expect(agreed.window.source).toBe("override");
  });
});
