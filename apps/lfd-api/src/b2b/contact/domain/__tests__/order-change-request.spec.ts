import type { OrderChangeDetails } from "../customer-request-details.js";
import {
  CustomerRequestAlreadyHandledError,
  RequestPhotosNotAllowedError,
} from "../errors/contact-errors.js";
import {
  NotAnOrderChangeRequestError,
  OrderChangeErasedError,
  OrderChangeNeedsDecisionError,
  OrderChangeRefusalReasonMissingError,
} from "../errors/order-change-errors.js";
import {
  AT,
  CHANGE,
  LATER,
  ORDER,
  contactRequest,
  orderChange,
  photo,
} from "./request-fixtures.js";

const STAFF = { staffUserId: "staff_1", name: "Camille Durand", role: "commercial" };

function changeDetails(request: ReturnType<typeof orderChange>): OrderChangeDetails {
  const { details } = request;
  if (details.kind !== "order_change") {
    throw new Error("pas une demande de modification");
  }
  return details;
}

/**
 * La demande de modification d'une commande (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4) : une réponse,
 * une seule — appliquée ou refusée avec un mot —, jamais « traitée » sans
 * réponse, et rien à appliquer une fois anonymisée.
 */
describe("CustomerRequest — demande de modification", () => {
  it("se reçoit sans mot : la commande, la révision de départ et la composition", () => {
    const request = orderChange();
    expect(request.kind).toBe("order_change");
    expect(changeDetails(request)).toEqual({
      kind: "order_change",
      order: ORDER,
      baseRevision: 1,
      change: CHANGE,
      decision: null,
    });
    expect(request.pendingOrderChange()).toEqual({ order: ORDER, baseRevision: 1, change: CHANGE });
  });

  it("appliquée : la révision produite, et traitée par qui l'a appliquée", () => {
    const request = orderChange();
    request.recordChangeApplied(2, STAFF, LATER);
    expect(changeDetails(request).decision).toEqual({ kind: "applied", revision: 2 });
    expect(request.toPersistence().handling).toEqual({ at: LATER, by: STAFF });
  });

  it("refusée : le mot, rogné, et traitée", () => {
    const request = orderChange();
    expect(request.refuseChange("  La fournée est lancée.  ", STAFF, LATER)).toBe(
      "La fournée est lancée.",
    );
    expect(changeDetails(request).decision).toEqual({
      kind: "refused",
      reason: "La fournée est lancée.",
    });
  });

  it("refuse un refus sans mot", () => {
    expect(() => orderChange().refuseChange("   ", STAFF, LATER)).toThrow(
      OrderChangeRefusalReasonMissingError,
    );
  });

  it("ne répond qu'une fois", () => {
    const request = orderChange();
    request.recordChangeApplied(2, STAFF, LATER);
    expect(() => request.refuseChange("Non.", STAFF, LATER)).toThrow(
      CustomerRequestAlreadyHandledError,
    );
    expect(() => request.pendingOrderChange()).toThrow(CustomerRequestAlreadyHandledError);
  });

  it("ne se marque pas « traitée » : le client attend une réponse", () => {
    expect(() => orderChange().markHandled(STAFF, LATER)).toThrow(OrderChangeNeedsDecisionError);
  });

  it("« Appliquer » ou « Refuser » sur une autre demande est refusé", () => {
    const request = contactRequest();
    expect(() => request.pendingOrderChange()).toThrow(NotAnOrderChangeRequestError);
    expect(() => request.refuseChange("Non.", STAFF, LATER)).toThrow(NotAnOrderChangeRequestError);
  });

  it("n'admet pas de photo", () => {
    expect(() => orderChange().attachPhoto("ph1", photo(), AT)).toThrow(
      RequestPhotosNotAllowedError,
    );
  });

  it("anonymisée : commande et composition effacées, le mot du refus aussi ; plus rien à appliquer", () => {
    const refused = orderChange();
    refused.refuseChange("Jean, la fournée est lancée.", STAFF, LATER);
    expect(refused.anonymize(LATER)).toEqual([]);
    expect(changeDetails(refused)).toEqual({
      kind: "order_change",
      order: null,
      baseRevision: 1,
      change: null,
      decision: { kind: "refused", reason: "" },
    });

    const pending = orderChange();
    pending.anonymize(LATER);
    expect(() => pending.pendingOrderChange()).toThrow(OrderChangeErasedError);
  });
});
