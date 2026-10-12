import { resolveWindowMode } from "@lfd/contracts";

import {
  DeadlineNotRegisteredError,
  DeadlineWindowHasStartError,
  DeliveryWindowRequiredError,
  SlotNotRegisteredError,
} from "../../errors/order-errors.js";
import { agreeFulfillment } from "../agreed-fulfillment.js";
import { ensureDeliveryWindow, preferredWindowOf } from "../delivery-window.js";

const SLOT = { start: "06:00", end: "08:00" };
const BEFORE_SIX = { start: null, end: "06:00" };
const FROM_SHOP = {
  deadlines: ["06:00", "11:00"],
  slots: [SLOT],
  requestedBy: "pro",
} as const;

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
      ensureDeliveryWindow({
        method: "delivery",
        mode: "deadline",
        requested: SLOT,
        agreed: SLOT,
        ...FROM_SHOP,
      }),
    ).toThrow(DeadlineWindowHasStartError);
  });

  it("accepte une échéance seule en mode échéance", () => {
    expect(() =>
      ensureDeliveryWindow({
        method: "delivery",
        mode: "deadline",
        requested: BEFORE_SIX,
        agreed: BEFORE_SIX,
        ...FROM_SHOP,
      }),
    ).not.toThrow();
  });

  /** CA1b : une livraison sans heure ne se place dans aucune tournée. */
  it("refuse une livraison sans fenêtre, quel que soit le mode", () => {
    for (const mode of ["slot", "deadline"] as const) {
      expect(() =>
        ensureDeliveryWindow({
          method: "delivery",
          mode,
          requested: undefined,
          agreed: null,
          ...FROM_SHOP,
        }),
      ).toThrow(DeliveryWindowRequiredError);
    }
  });

  it("ne juge pas un retrait", () => {
    expect(() =>
      ensureDeliveryWindow({
        method: "pickup",
        mode: "deadline",
        requested: SLOT,
        agreed: null,
        ...FROM_SHOP,
      }),
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

/** Décision Hugo du 2026-10-12 : seules les échéances inscrites sont valides. */
describe("une échéance hors de la liste de l'adresse", () => {
  const NINE = { start: null, end: "09:00" };
  const deadlineWindow = (
    deadlines: readonly string[],
    requestedBy: "pro" | "individual" | "staff",
  ): void =>
    ensureDeliveryWindow({
      method: "delivery",
      mode: "deadline",
      requested: NINE,
      agreed: NINE,
      deadlines,
      slots: [],
      requestedBy,
    });

  it("est refusée quand un client pro la demande, en nommant les échéances admises", () => {
    expect(() => deadlineWindow(["06:00", "11:00"], "pro")).toThrow(DeadlineNotRegisteredError);
    expect(() => deadlineWindow(["06:00", "11:00"], "pro")).toThrow(/06:00, 11:00/);
  });

  it("est refusée par un client pro quand l'adresse n'en porte aucune ce jour-là", () => {
    expect(() => deadlineWindow([], "pro")).toThrow(/Mon compte/);
  });

  it("reste admise pour un particulier, qui n'a pas de commercial", () => {
    expect(() => deadlineWindow([], "individual")).not.toThrow();
  });

  it("reste admise pour la saisie staff (choix à trancher par Hugo)", () => {
    expect(() => deadlineWindow(["06:00", "11:00"], "staff")).not.toThrow();
    expect(() => deadlineWindow([], "staff")).not.toThrow();
  });
});

/** Décision Hugo du 2026-10-12, étendue au créneau : seuls les créneaux inscrits. */
describe("un créneau hors de la liste de l'adresse", () => {
  const MIDDAY = { start: "11:00", end: "13:00" };
  const slotWindow = (
    requested: { readonly start: string | null; readonly end: string },
    slots: readonly { readonly start: string | null; readonly end: string }[],
    requestedBy: "pro" | "individual" | "staff",
  ): void =>
    ensureDeliveryWindow({
      method: "delivery",
      mode: "slot",
      requested,
      agreed: requested,
      deadlines: [],
      slots,
      requestedBy,
    });

  it("est refusé quand un client pro le demande, en nommant les créneaux admis", () => {
    expect(() => slotWindow(MIDDAY, [SLOT], "pro")).toThrow(SlotNotRegisteredError);
    expect(() => slotWindow(MIDDAY, [SLOT], "pro")).toThrow(/06:00–08:00/);
  });

  it("refuse un créneau qui ne partage qu'une borne avec un inscrit", () => {
    expect(() => slotWindow({ start: "07:00", end: "08:00" }, [SLOT], "pro")).toThrow(
      SlotNotRegisteredError,
    );
  });

  it("est refusé par un client pro quand l'adresse n'en porte aucun ce jour-là", () => {
    expect(() => slotWindow(SLOT, [], "pro")).toThrow(SlotNotRegisteredError);
  });

  it("admet un créneau inscrit", () => {
    expect(() => slotWindow(SLOT, [SLOT, MIDDAY], "pro")).not.toThrow();
  });

  it("reste admis pour la saisie staff (choix à trancher par Hugo)", () => {
    expect(() => slotWindow(MIDDAY, [], "staff")).not.toThrow();
  });

  it("ne juge pas un retrait", () => {
    expect(() =>
      ensureDeliveryWindow({
        method: "pickup",
        mode: "slot",
        requested: MIDDAY,
        agreed: null,
        deadlines: [],
        slots: [],
        requestedBy: "pro",
      }),
    ).not.toThrow();
  });
});
