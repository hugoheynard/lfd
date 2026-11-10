import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import {
  AlreadyExemptError,
  ExemptedCompanyNotFoundError,
  ExemptedCompanyTerminatedError,
  OrderOpeningExemptionNotFoundError,
} from "../errors/order-opening-exemption-errors.js";
import { OrderOpeningExemption } from "../order-opening-exemption.js";

const STAMP = { at: new Date(0), author: { staffUserId: "s1", name: "Colette", role: "admin" } };

function company(id: string, companyId = "c1"): OrderOpeningExemption {
  return OrderOpeningExemption.grantToCompany({
    id,
    companyId,
    company: { name: "Chez Paul", status: "active" },
    active: [],
    stamp: STAMP,
  });
}

describe("OrderOpeningExemption", () => {
  it("normalise l'adresse à l'ajout", () => {
    const exemption = OrderOpeningExemption.grantToEmail({
      id: "x1",
      email: "  Jean@Folie.FR ",
      active: [],
      stamp: STAMP,
    });

    expect(exemption.target).toEqual({ kind: "email", email: "jean@folie.fr" });
    expect(exemption.label).toBe("jean@folie.fr");
  });

  it("refuse une adresse qui n'en est pas une", () => {
    expect(() =>
      OrderOpeningExemption.grantToEmail({ id: "x1", email: "jean", active: [], stamp: STAMP }),
    ).toThrow(InvalidEmailError);
  });

  it("fige le nom de la société", () => {
    expect(company("x1").label).toBe("Chez Paul");
  });

  it("refuse une société inexistante", () => {
    expect(() =>
      OrderOpeningExemption.grantToCompany({
        id: "x1",
        companyId: "c9",
        company: null,
        active: [],
        stamp: STAMP,
      }),
    ).toThrow(ExemptedCompanyNotFoundError);
  });

  it("refuse une société archivée, en proposant l'adresse", () => {
    expect(() =>
      OrderOpeningExemption.grantToCompany({
        id: "x1",
        companyId: "c1",
        company: { name: "Chez Paul", status: "terminated" },
        active: [],
        stamp: STAMP,
      }),
    ).toThrow(ExemptedCompanyTerminatedError);
  });

  it("accepte une société suspendue ou en attente", () => {
    for (const status of ["suspended", "pending"] as const) {
      const exemption = OrderOpeningExemption.grantToCompany({
        id: "x1",
        companyId: "c1",
        company: { name: "Chez Paul", status },
        active: [],
        stamp: STAMP,
      });
      expect(exemption.isActive()).toBe(true);
    }
  });

  it("refuse une cible déjà exemptée, adresse comparée sans la casse", () => {
    const first = OrderOpeningExemption.grantToEmail({
      id: "x1",
      email: "jean@folie.fr",
      active: [],
      stamp: STAMP,
    });

    expect(() =>
      OrderOpeningExemption.grantToEmail({
        id: "x2",
        email: "JEAN@folie.fr",
        active: [first],
        stamp: STAMP,
      }),
    ).toThrow(AlreadyExemptError);
    expect(() =>
      OrderOpeningExemption.grantToCompany({
        id: "x3",
        companyId: "c1",
        company: { name: "Chez Paul", status: "active" },
        active: [company("x4")],
        stamp: STAMP,
      }),
    ).toThrow(AlreadyExemptError);
  });

  it("accepte de nouveau une cible dont l'exemption a été retirée", () => {
    const old = company("x1");
    old.withdraw(STAMP);

    expect(() =>
      OrderOpeningExemption.grantToCompany({
        id: "x2",
        companyId: "c1",
        company: { name: "Chez Paul", status: "active" },
        active: [old],
        stamp: STAMP,
      }),
    ).not.toThrow();
  });

  it("se retire une fois, archivée avec son auteur, et ne couvre plus personne", () => {
    const exemption = company("x1");

    exemption.withdraw(STAMP);

    expect(exemption.withdrawn).toEqual(STAMP);
    expect(exemption.covers({ companyId: "c1", email: null })).toBe(false);
    expect(() => exemption.withdraw(STAMP)).toThrow(OrderOpeningExemptionNotFoundError);
  });

  it("une société ne couvre pas une adresse, ni l'inverse", () => {
    expect(company("x1").covers({ companyId: null, email: "c1" })).toBe(false);
  });
});
