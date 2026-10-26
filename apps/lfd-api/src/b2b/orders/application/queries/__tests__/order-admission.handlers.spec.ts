import { OrderOpeningExemption } from "../../../../order-opening/domain/order-opening-exemption.js";
import { intakeAt } from "../../commands/__tests__/intake-doubles.js";
import { GetGuestOrderAdmissionHandler } from "../get-guest-order-admission.handler.js";
import { GetGuestOrderAdmissionQuery } from "../get-guest-order-admission.query.js";
import { GetMyOrderAdmissionHandler } from "../get-my-order-admission.handler.js";
import { GetMyOrderAdmissionQuery } from "../get-my-order-admission.query.js";

const STAMP = { at: new Date(0), author: { staffUserId: "s1", name: "Colette", role: "admin" } };
const CLOSED_TO_ALL = { ordersOpenToB2b: false, ordersOpenToB2c: false };

const companyExemption = (companyId: string): OrderOpeningExemption =>
  OrderOpeningExemption.grantToCompany({
    id: "x1",
    companyId,
    company: { name: "Chez Paul", status: "active" },
    active: [],
    stamp: STAMP,
  });

const emailExemption = (email: string): OrderOpeningExemption =>
  OrderOpeningExemption.grantToEmail({ id: "x2", email, active: [], stamp: STAMP });

/** « Fermée, mais vous pouvez commander » — la porte lue sans refus (2026-10-26). */
describe("GetMyOrderAdmissionHandler", () => {
  it("dit ouvert et commandable tant que personne n'a rien fermé", async () => {
    const handler = new GetMyOrderAdmissionHandler(intakeAt());

    await expect(handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"))).resolves.toEqual({
      ordersOpen: true,
      canOrder: true,
    });
  });

  it("dit fermé mais commandable à la société exemptée", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    await expect(handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: true,
    });
  });

  it("dit fermé et non commandable à une autre société", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    await expect(handler.execute(new GetMyOrderAdmissionQuery("c2", "u1"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: false,
    });
  });

  it("couvre la personne connectée par son adresse, en espace perso", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [emailExemption("jean@folie.fr")], {
        u1: "Jean@Folie.fr",
        u2: "autre@folie.fr",
      }),
    );

    await expect(handler.execute(new GetMyOrderAdmissionQuery(null, "u1"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: true,
    });
    await expect(handler.execute(new GetMyOrderAdmissionQuery(null, "u2"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: false,
    });
  });

  it("ne rend que les deux booléens, rien de l'exemption", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    const view = await handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"));

    expect(Object.keys(view).sort()).toEqual(["canOrder", "ordersOpen"]);
  });
});

describe("GetGuestOrderAdmissionHandler", () => {
  it("prend toute adresse quand la boutique est ouverte aux particuliers", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt({ ordersOpenToB2b: false, ordersOpenToB2c: true }),
    );

    await expect(handler.execute(new GetGuestOrderAdmissionQuery("qui@que.fr"))).resolves.toEqual({
      canOrder: true,
    });
  });

  it("ne prend, boutique fermée, que l'adresse exemptée", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [emailExemption("camille@visiteur.fr")]),
    );

    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("Camille@Visiteur.fr")),
    ).resolves.toEqual({ canOrder: true });
    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("autre@visiteur.fr")),
    ).resolves.toEqual({ canOrder: false });
  });

  it("n'ouvre pas l'invité par l'exemption d'une société", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("camille@visiteur.fr")),
    ).resolves.toEqual({ canOrder: false });
  });
});
