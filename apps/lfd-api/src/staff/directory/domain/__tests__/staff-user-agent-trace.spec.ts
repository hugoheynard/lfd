import { checkJournalFact } from "@lfd/contracts/journal-facts";

import {
  assertStaffUserUnchangedSince,
  StaffUserChangedSinceReadError,
} from "../staff-user-errors.js";
import { STAFF_FACTS, staffUserEditFacts } from "../staff-facts.js";
import type { StaffUserEdit, StaffUserSnapshot } from "../staff-user-state.js";

/** La précondition d'une édition et la trace d'agent (plan `plan-outils-agent-droits.md`). */

const BEFORE: StaffUserSnapshot = {
  id: "s1",
  firstName: "Cécile",
  lastName: "Martin",
  email: "cecile@lfc.test",
  phone: "",
  jobTitle: "",
  role: "commercial",
  status: "active",
  auth0Id: null,
};

/** Un changement de rôle et une dérogation : deux faits, chacun marqué. */
const EDIT: StaffUserEdit = {
  before: BEFORE,
  after: { ...BEFORE, role: "fournil" },
  overrides: {
    added: [{ resource: "b2b_alerts", action: "read", effect: "allow" }],
    removed: [],
    changed: [],
  },
  roleLabels: { before: "Commercial", after: "Fournil" },
};

describe("staffUserEditFacts — la trace d'un outil agent", () => {
  it("pose `via` sur chaque fait de l'édition, conforme au catalogue", () => {
    const facts = staffUserEditFacts("s1", EDIT, "staff_assign_role");

    expect(facts.map((fact) => fact.type)).toEqual([
      STAFF_FACTS.roleChanged,
      STAFF_FACTS.overridesChanged,
    ]);
    for (const fact of facts) {
      expect(fact.payload).toMatchObject({ via: { agentTool: "staff_assign_role" } });
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });

  it("n'en pose aucune pour un geste d'écran", () => {
    for (const fact of staffUserEditFacts("s1", EDIT)) {
      expect(fact.payload).not.toHaveProperty("via");
    }
  });
});

describe("assertStaffUserUnchangedSince", () => {
  /** Un instant quelconque : la précondition ne le compare qu'à lui-même. */
  const WRITTEN = new Date(1_000_000);

  it("se tait sans précondition, ou quand la date lue est la date écrite", () => {
    expect(() => assertStaffUserUnchangedSince("s1", undefined, WRITTEN)).not.toThrow();
    expect(() => assertStaffUserUnchangedSince("s1", WRITTEN.toISOString(), WRITTEN)).not.toThrow();
  });

  it("refuse (409) une fiche écrite depuis la lecture", () => {
    const later = new Date(WRITTEN.getTime() + 1);
    expect(() => assertStaffUserUnchangedSince("s1", WRITTEN.toISOString(), later)).toThrow(
      StaffUserChangedSinceReadError,
    );
  });
});
