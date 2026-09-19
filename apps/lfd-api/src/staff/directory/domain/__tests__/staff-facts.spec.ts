import { STAFF_RESOURCE_LABELS, type StaffOverride } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import type { OverrideDiff } from "../override-diff.js";
import {
  STAFF_FACTS,
  staffPasswordLinkIssuedFact,
  staffStatusFact,
  staffUserCreatedFact,
  staffUserDeletedFact,
  staffUserEditFacts,
  staffUserInvitedFact,
} from "../staff-facts.js";
import type { StaffUserEdit, StaffUserIdentity, StaffUserSnapshot } from "../staff-user-state.js";

const BEFORE: StaffUserSnapshot = {
  id: "s1",
  firstName: "Cécile",
  lastName: "Martin",
  email: "cecile@lfc.test",
  phone: "",
  jobTitle: "",
  role: "commercial",
  status: "active",
  auth0Id: "auth0|cecile",
};

const NO_OVERRIDE_CHANGE: OverrideDiff = { added: [], removed: [], changed: [] };

const IDENTITY: StaffUserIdentity = {
  firstName: BEFORE.firstName,
  lastName: BEFORE.lastName,
  email: BEFORE.email,
  phone: BEFORE.phone,
  jobTitle: BEFORE.jobTitle,
  role: BEFORE.role,
};

function edit(after: Partial<StaffUserIdentity>, overrides = NO_OVERRIDE_CHANGE): StaffUserEdit {
  return { before: BEFORE, after: { ...IDENTITY, ...after }, overrides };
}

/** Aucune adresse, aucun lien, aucun `sub` ne doit sortir vers le journal (D5). */
function assertNoContactLeak(payload: Record<string, unknown>): void {
  const text = JSON.stringify(payload);
  expect(text).not.toContain("@");
  expect(text).not.toContain("http");
  expect(text).not.toContain("auth0|");
}

describe("les faits de l'annuaire — un par changement réel", () => {
  it("n'écrit rien pour une édition vide", () => {
    expect(staffUserEditFacts("s1", edit({}))).toEqual([]);
  });

  it("écrit TROIS faits quand identité, rôle et dérogations changent ensemble", () => {
    const added: StaffOverride = { resource: "b2b_pricing", action: "write", effect: "allow" };

    const facts = staffUserEditFacts(
      "s1",
      edit(
        { phone: "0600000000", role: "comptabilite" },
        { ...NO_OVERRIDE_CHANGE, added: [added] },
      ),
    );

    expect(facts.map((fact) => fact.type)).toEqual([
      STAFF_FACTS.identityEdited,
      STAFF_FACTS.roleChanged,
      STAFF_FACTS.overridesChanged,
    ]);
    expect(
      facts.every((fact) => fact.subjectType === "staff_user" && fact.subjectId === "s1"),
    ).toBe(true);
  });

  it("nomme les champs d'identité en libellés, sans `previous` si le nom n'a pas bougé", () => {
    const [fact] = staffUserEditFacts("s1", edit({ phone: "0600000000", jobTitle: "Vendeuse" }));

    expect(fact?.payload).toEqual({
      subjectLabel: "Cécile Martin",
      person: { firstName: "Cécile", lastName: "Martin" },
      previous: null,
      changes: [
        { field: "phone", label: "téléphone", from: "", to: "0600000000" },
        { field: "jobTitle", label: "fonction", from: "", to: "Vendeuse" },
      ],
    });
  });

  it("fige l'avant ET l'après d'un champ vidé — la chaîne vide est une valeur", () => {
    const before = { ...BEFORE, phone: "0600000000" };
    const [fact] = staffUserEditFacts("s1", {
      before,
      after: { ...IDENTITY, phone: "" },
      overrides: NO_OVERRIDE_CHANGE,
    });

    expect(fact?.payload).toMatchObject({
      changes: [{ field: "phone", label: "téléphone", from: "0600000000", to: "" }],
    });
  });

  it("ne trace QUE les champs modifiés, dans l'ordre de la fiche", () => {
    const [fact] = staffUserEditFacts("s1", edit({ jobTitle: "Vendeuse", firstName: "Cléa" }));

    expect(fact?.payload).toMatchObject({
      changes: [
        { field: "firstName", label: "prénom", from: "Cécile", to: "Cléa" },
        { field: "jobTitle", label: "fonction", from: "", to: "Vendeuse" },
      ],
    });
  });

  it("fige l'ancien nom quand la personne est renommée", () => {
    const [fact] = staffUserEditFacts("s1", edit({ lastName: "Durand" }));

    expect(fact?.payload).toEqual({
      // Le nom APRÈS le geste : c'est sous lui qu'on retrouve la fiche.
      subjectLabel: "Cécile Durand",
      person: { firstName: "Cécile", lastName: "Durand" },
      previous: { firstName: "Cécile", lastName: "Martin" },
      changes: [{ field: "lastName", label: "nom", from: "Martin", to: "Durand" }],
    });
  });

  /**
   * Hugo a tranché le 2026-09-18 : une édition trace l'avant/après, e-mail
   * compris. Ce cas affirmait l'inverse (D5) jusqu'à cette date.
   */
  it("trace l'ancienne et la nouvelle adresse d'un changement d'e-mail — sans lien ni `sub`", () => {
    const [fact] = staffUserEditFacts("s1", edit({ email: "c.martin@lfc.test" }));

    expect(fact?.payload).toMatchObject({
      changes: [
        { field: "email", label: "e-mail", from: "cecile@lfc.test", to: "c.martin@lfc.test" },
      ],
    });
    const text = JSON.stringify(fact?.payload ?? {});
    expect(text).not.toContain("http");
    expect(text).not.toContain("auth0|");
  });

  it("fige les libellés des rôles, pas leurs clés", () => {
    const [fact] = staffUserEditFacts("s1", edit({ role: "comptabilite" }));

    expect(fact?.payload).toEqual({
      subjectLabel: "Cécile Martin",
      person: { firstName: "Cécile", lastName: "Martin" },
      fromLabel: "Commercial",
      toLabel: "Comptabilité",
    });
  });

  it("décrit le diff des dérogations avec les libellés de ressource", () => {
    const flipped: StaffOverride = { resource: "b2b_growth", action: "read", effect: "allow" };
    const removed: StaffOverride = { resource: "b2b_orders", action: "write", effect: "deny" };

    const [fact] = staffUserEditFacts(
      "s1",
      edit({}, { added: [], removed: [removed], changed: [flipped] }),
    );

    expect(fact?.type).toBe(STAFF_FACTS.overridesChanged);
    expect(fact?.payload).toEqual({
      subjectLabel: "Cécile Martin",
      person: { firstName: "Cécile", lastName: "Martin" },
      added: [],
      removed: [
        {
          resource: "b2b_orders",
          resourceLabel: STAFF_RESOURCE_LABELS.b2b_orders,
          action: "write",
          effect: "deny",
        },
      ],
      changed: [
        {
          resource: "b2b_growth",
          resourceLabel: STAFF_RESOURCE_LABELS.b2b_growth,
          action: "read",
          effect: "allow",
        },
      ],
    });
  });
});

describe("les faits de l'annuaire — les gestes à un seul fait", () => {
  it("crée : la personne et le libellé de son rôle", () => {
    const fact = staffUserCreatedFact("s1", {
      firstName: "Cécile",
      lastName: "Martin",
      role: "support",
    });

    expect(fact).toEqual({
      type: STAFF_FACTS.created,
      subjectType: "staff_user",
      subjectId: "s1",
      payload: {
        subjectLabel: "Cécile Martin",
        person: { firstName: "Cécile", lastName: "Martin" },
        roleLabel: "Support",
      },
    });
  });

  it("invite ou renvoie un mot de passe — sans e-mail ni lien", () => {
    const fact = staffUserInvitedFact("s1", BEFORE, "password_reset");

    expect(fact.payload).toEqual({
      subjectLabel: "Cécile Martin",
      person: { firstName: "Cécile", lastName: "Martin" },
      kind: "password_reset",
    });
    assertNoContactLeak(fact.payload);
  });

  it("fabrique un lien à remettre : la personne seulement", () => {
    const fact = staffPasswordLinkIssuedFact("s1", BEFORE);

    expect(fact.type).toBe(STAFF_FACTS.passwordLinkIssued);
    expect(fact.payload).toEqual({
      subjectLabel: "Cécile Martin",
      person: { firstName: "Cécile", lastName: "Martin" },
    });
  });

  it("supprime : fige qui elle était et son rôle", () => {
    expect(staffUserDeletedFact("s1", BEFORE).payload).toEqual({
      person: { firstName: "Cécile", lastName: "Martin" },
      roleLabel: "Commercial",
    });
  });

  it("suspend et réintègre, et se tait quand l'état ne bouge pas", () => {
    expect(staffStatusFact("s1", BEFORE, "active", "suspended")?.type).toBe(STAFF_FACTS.suspended);
    expect(staffStatusFact("s1", BEFORE, "suspended", "active")?.type).toBe(STAFF_FACTS.reinstated);
    expect(staffStatusFact("s1", BEFORE, "suspended", "suspended")).toBeNull();
    expect(staffStatusFact("s1", BEFORE, "active", "active")).toBeNull();
  });

  /**
   * Régression (D7 du plan des phrases) : la première activation d'une fiche
   * en attente s'écrivait `reinstated`, et l'écran disait « a rétabli
   * l'accès » d'une personne qui n'en avait jamais eu.
   */
  it("une PREMIÈRE activation s'écrit `activated`, pas `reinstated`", () => {
    expect(staffStatusFact("s1", BEFORE, "pending", "active")?.type).toBe(STAFF_FACTS.activated);
    expect(staffStatusFact("s1", BEFORE, "invited", "active")?.type).toBe(STAFF_FACTS.activated);
    expect(staffStatusFact("s1", BEFORE, "pending", "suspended")?.type).toBe(STAFF_FACTS.suspended);
  });

  it("chaque fait écrit suit la forme courante du catalogue, libellé du sujet compris", () => {
    const written = [
      staffUserCreatedFact("s1", BEFORE),
      staffUserInvitedFact("s1", BEFORE, "invitation"),
      staffPasswordLinkIssuedFact("s1", BEFORE),
      staffStatusFact("s1", BEFORE, "pending", "active"),
      staffStatusFact("s1", BEFORE, "suspended", "active"),
      staffStatusFact("s1", BEFORE, "active", "suspended"),
      ...staffUserEditFacts(
        "s1",
        edit(
          { lastName: "Durand", role: "support" },
          {
            ...NO_OVERRIDE_CHANGE,
            removed: [{ resource: "b2b_orders", action: "read", effect: "deny" }],
          },
        ),
      ),
    ];

    for (const fact of written) {
      expect(fact === null ? "absent" : checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });
});
