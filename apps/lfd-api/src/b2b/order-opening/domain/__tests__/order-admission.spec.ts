import { admitsOrder } from "../order-admission.js";
import { OrderOpeningExemption } from "../order-opening-exemption.js";

/** La garde de passation, pure (décision de Hugo du 2026-10-26). */

const STAMP = { at: new Date(0), author: { staffUserId: "s1", name: "Colette", role: "admin" } };
const OPEN = { ordersOpenToB2b: true, ordersOpenToB2c: true };
const CLOSED = { ordersOpenToB2b: false, ordersOpenToB2c: false };

const companyExemption = OrderOpeningExemption.grantToCompany({
  id: "x1",
  companyId: "c1",
  company: { name: "Chez Paul", status: "active" },
  active: [],
  stamp: STAMP,
});
const emailExemption = OrderOpeningExemption.grantToEmail({
  id: "x2",
  email: "camille@visiteur.fr",
  active: [],
  stamp: STAMP,
});

describe("admitsOrder", () => {
  it("ouverte : passe, exemption ou pas", () => {
    expect(
      admitsOrder({
        opening: OPEN,
        audience: "b2b",
        exemptions: [],
        party: { companyId: "c9", email: null },
      }),
    ).toBe(true);
  });

  it("fermée sans exemption : refus inchangé", () => {
    expect(
      admitsOrder({
        opening: CLOSED,
        audience: "b2b",
        exemptions: [],
        party: { companyId: "c1", email: "camille@visiteur.fr" },
      }),
    ).toBe(false);
  });

  it("fermée, société exemptée : passe ; une autre société non", () => {
    const exemptions = [companyExemption];

    expect(
      admitsOrder({
        opening: CLOSED,
        audience: "b2b",
        exemptions,
        party: { companyId: "c1", email: null },
      }),
    ).toBe(true);
    expect(
      admitsOrder({
        opening: CLOSED,
        audience: "b2b",
        exemptions,
        party: { companyId: "c2", email: null },
      }),
    ).toBe(false);
  });

  it("fermée, adresse exemptée : passe, casse et espaces ignorés", () => {
    expect(
      admitsOrder({
        opening: CLOSED,
        audience: "b2c",
        exemptions: [emailExemption],
        party: { companyId: null, email: "  Camille@Visiteur.FR " },
      }),
    ).toBe(true);
  });

  it("fermée, exemption retirée : refus", () => {
    const withdrawn = OrderOpeningExemption.grantToEmail({
      id: "x3",
      email: "camille@visiteur.fr",
      active: [],
      stamp: STAMP,
    });
    withdrawn.withdraw(STAMP);

    expect(
      admitsOrder({
        opening: CLOSED,
        audience: "b2c",
        exemptions: [withdrawn],
        party: { companyId: null, email: "camille@visiteur.fr" },
      }),
    ).toBe(false);
  });

  it("fermée aux seuls pros : un particulier passe sans exemption", () => {
    expect(
      admitsOrder({
        opening: { ordersOpenToB2b: false, ordersOpenToB2c: true },
        audience: "b2c",
        exemptions: [],
        party: { companyId: null, email: null },
      }),
    ).toBe(true);
  });
});
