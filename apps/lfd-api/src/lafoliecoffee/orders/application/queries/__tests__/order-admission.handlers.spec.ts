import { addDays, instantToLocal } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderOpeningExemption } from "../../../../order-opening/domain/order-opening-exemption.js";
import { intakeAt } from "../../commands/__tests__/intake-doubles.js";
import { GetGuestOrderAdmissionHandler } from "../get-guest-order-admission.handler.js";
import { GetGuestOrderAdmissionQuery } from "../get-guest-order-admission.query.js";
import { GetMyOrderAdmissionHandler } from "../get-my-order-admission.handler.js";
import { GetMyOrderAdmissionQuery } from "../get-my-order-admission.query.js";

const STAMP = { at: new Date(0), author: { staffUserId: "s1", name: "Colette", role: "admin" } };
const CLOSED_TO_ALL = { ordersOpenToB2b: false, ordersOpenToB2c: false };
// L'horloge des cas « premier jour » : les dates se placent relativement à elle.
const CLOCK = new FixedClock(new Date(0));
const TODAY = instantToLocal(CLOCK.now()).day;
const FIRST = addDays(TODAY, 3);

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
      firstServiceDay: null,
    });
  });

  it("dit fermé mais commandable à la société exemptée", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    await expect(handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: true,
      firstServiceDay: null,
    });
  });

  it("dit fermé et non commandable à une autre société", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    await expect(handler.execute(new GetMyOrderAdmissionQuery("c2", "u1"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: false,
      firstServiceDay: null,
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
      firstServiceDay: null,
    });
    await expect(handler.execute(new GetMyOrderAdmissionQuery(null, "u2"))).resolves.toEqual({
      ordersOpen: false,
      canOrder: false,
      firstServiceDay: null,
    });
  });

  it("ne rend que les deux booléens et le premier jour, rien de l'exemption", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    const view = await handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"));

    expect(Object.keys(view).sort()).toEqual(["canOrder", "firstServiceDay", "ordersOpen"]);
  });
});

describe("GetGuestOrderAdmissionHandler", () => {
  it("prend toute adresse quand la boutique est ouverte aux particuliers", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt({ ordersOpenToB2b: false, ordersOpenToB2c: true }),
    );

    await expect(handler.execute(new GetGuestOrderAdmissionQuery("qui@que.fr"))).resolves.toEqual({
      canOrder: true,
      firstServiceDay: null,
    });
  });

  it("ne prend, boutique fermée, que l'adresse exemptée", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [emailExemption("camille@visiteur.fr")]),
    );

    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("Camille@Visiteur.fr")),
    ).resolves.toEqual({ canOrder: true, firstServiceDay: null });
    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("autre@visiteur.fr")),
    ).resolves.toEqual({ canOrder: false, firstServiceDay: null });
  });

  it("n'ouvre pas l'invité par l'exemption d'une société", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt(CLOSED_TO_ALL, "active", [companyExemption("c1")]),
    );

    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("camille@visiteur.fr")),
    ).resolves.toEqual({ canOrder: false, firstServiceDay: null });
  });
});

/** Plan « premier jour commandable » (2026-10-28) : la date de CETTE personne. */
describe("Admission par personne — premier jour commandable", () => {
  const opening = { firstServiceDayB2b: FIRST, firstServiceDayB2c: addDays(FIRST, 1) };

  it("rend la date de la clientèle à la personne connectée", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(opening, "active", [], {}, undefined, CLOCK),
    );

    await expect(handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"))).resolves.toEqual({
      ordersOpen: true,
      canOrder: true,
      firstServiceDay: FIRST,
    });
  });

  it("rend null à la société exemptée", async () => {
    const handler = new GetMyOrderAdmissionHandler(
      intakeAt(opening, "active", [companyExemption("c1")], {}, undefined, CLOCK),
    );

    const view = await handler.execute(new GetMyOrderAdmissionQuery("c1", "u1"));

    expect(view.firstServiceDay).toBeNull();
  });

  it("rend la date des particuliers à l'invité, et null à l'adresse exemptée", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt(opening, "active", [emailExemption("camille@visiteur.fr")], {}, undefined, CLOCK),
    );

    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("autre@visiteur.fr")),
    ).resolves.toEqual({
      canOrder: true,
      firstServiceDay: addDays(FIRST, 1),
    });
    await expect(
      handler.execute(new GetGuestOrderAdmissionQuery("camille@visiteur.fr")),
    ).resolves.toEqual({ canOrder: true, firstServiceDay: null });
  });

  it("rend null quand la date est atteinte", async () => {
    const handler = new GetGuestOrderAdmissionHandler(
      intakeAt({ firstServiceDayB2c: TODAY }, "active", [], {}, undefined, CLOCK),
    );

    const view = await handler.execute(new GetGuestOrderAdmissionQuery("qui@que.fr"));

    expect(view.firstServiceDay).toBeNull();
  });
});
