import { workLevelOf, type WorkLevelInput } from "../work-level.js";

/** Une fiche active, tout tenu — on retire ensuite. */
function sheet(over: Partial<WorkLevelInput> = {}): WorkLevelInput {
  return {
    interlocutor: { name: "Camille Durand", email: "camille@exemple.fr", phone: "" },
    notedContacts: 1,
    hasBillingAddress: true,
    deliveryAddressCount: 1,
    noDeliveryAddressNeeded: false,
    holderLoggedIn: true,
    activated: true,
    hasOrder: true,
    ...over,
  };
}

const EMPTY = {
  interlocutor: { name: "", email: "", phone: "" },
  notedContacts: 0,
  hasBillingAddress: false,
  deliveryAddressCount: 0,
  noDeliveryAddressNeeded: false,
  holderLoggedIn: false,
  activated: false,
  hasOrder: false,
} satisfies WorkLevelInput;

describe("le niveau de travail d'une fiche", () => {
  it("range une fiche vide à l'annuaire, et dit les manques du contact", () => {
    expect(workLevelOf(EMPTY)).toEqual({
      level: "directory",
      missing: ["interlocutor", "noted_contact"],
    });
  });

  it("garde à l'annuaire un nom et un numéro sans contact noté", () => {
    const reading = workLevelOf({
      ...EMPTY,
      interlocutor: { name: "Camille", email: "", phone: "0601020304" },
    });
    expect(reading).toEqual({ level: "directory", missing: ["noted_contact"] });
  });

  it("garde à l'annuaire un contact noté sans interlocuteur", () => {
    expect(workLevelOf({ ...EMPTY, notedContacts: 2 })).toEqual({
      level: "directory",
      missing: ["interlocutor"],
    });
  });

  it.each([
    ["un nom sans moyen de le joindre", { name: "Camille", email: "", phone: "" }],
    ["un e-mail sans nom", { name: "", email: "c@exemple.fr", phone: "" }],
    ["des blancs", { name: "   ", email: "  ", phone: " " }],
  ])("ne compte pas comme interlocuteur %s", (_case, interlocutor) => {
    expect(workLevelOf({ ...EMPTY, interlocutor, notedContacts: 1 }).missing).toEqual([
      "interlocutor",
    ]);
  });

  it("monte à « Contactée » avec un nom, un téléphone et un contact noté", () => {
    const reading = workLevelOf({
      ...EMPTY,
      interlocutor: { name: "Camille", email: "", phone: "0601020304" },
      notedContacts: 1,
    });
    expect(reading).toEqual({
      level: "contacted",
      missing: ["billing_address", "delivery_address"],
    });
  });

  it("ne réclame pas d'adresse de livraison quand aucune n'est due (retrait seul, groupe)", () => {
    const reading = workLevelOf(
      sheet({
        deliveryAddressCount: 0,
        noDeliveryAddressNeeded: true,
        holderLoggedIn: false,
        activated: false,
      }),
    );
    expect(reading).toEqual({ level: "qualified", missing: ["holder_login"] });
  });

  it("réclame l'adresse de livraison quand elle est due", () => {
    expect(
      workLevelOf(sheet({ deliveryAddressCount: 0, holderLoggedIn: false, activated: false })),
    ).toEqual({ level: "contacted", missing: ["delivery_address"] });
  });

  it("réclame la facturation même sans livraison due", () => {
    expect(
      workLevelOf(
        sheet({
          hasBillingAddress: false,
          noDeliveryAddressNeeded: true,
          holderLoggedIn: false,
          activated: false,
        }),
      ),
    ).toEqual({ level: "contacted", missing: ["billing_address"] });
  });

  it("monte à « Ouverte » quand le détenteur s'est connecté", () => {
    expect(workLevelOf(sheet({ activated: false, hasOrder: false }))).toEqual({
      level: "opened",
      missing: ["activation", "first_order"],
    });
  });

  it("ne dit « Active » qu'activée ET avec une commande", () => {
    expect(workLevelOf(sheet({ hasOrder: false }))).toEqual({
      level: "opened",
      missing: ["first_order"],
    });
    expect(workLevelOf(sheet({ activated: false })).level).toBe("opened");
    expect(workLevelOf(sheet())).toEqual({ level: "active", missing: [] });
  });

  it("garde « Active » à un client sans contact noté, et montre le manque", () => {
    expect(workLevelOf(sheet({ notedContacts: 0 }))).toEqual({
      level: "active",
      missing: ["noted_contact"],
    });
  });

  it("met une inscription client qui commande au niveau « Active », avec tout ce qui manque en dessous", () => {
    const reading = workLevelOf({
      ...EMPTY,
      interlocutor: { name: "Camille", email: "camille@exemple.fr", phone: "" },
      hasBillingAddress: true,
      noDeliveryAddressNeeded: true,
      holderLoggedIn: true,
      activated: true,
      hasOrder: true,
    });
    expect(reading).toEqual({ level: "active", missing: ["noted_contact"] });
  });

  it("dit les manques d'en dessous ET du suivant", () => {
    expect(workLevelOf({ ...EMPTY, holderLoggedIn: true })).toEqual({
      level: "opened",
      missing: [
        "interlocutor",
        "noted_contact",
        "billing_address",
        "delivery_address",
        "activation",
        "first_order",
      ],
    });
  });

  it("redescend quand l'adresse de facturation est archivée, sans autre niveau tenu", () => {
    expect(
      workLevelOf(sheet({ hasBillingAddress: false, holderLoggedIn: false, activated: false }))
        .level,
    ).toBe("contacted");
  });
});
