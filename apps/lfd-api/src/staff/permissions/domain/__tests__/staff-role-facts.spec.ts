import { STAFF_RESOURCE_LABELS } from "@lfd/contracts";

import type { StaffRoleSnapshot } from "../staff-role-definition.js";
import {
  roleArchivedFact,
  roleCreatedFact,
  roleRestoredFact,
  roleUpdatedFact,
  STAFF_ROLE_FACTS,
} from "../staff-role-facts.js";

const LOGISTICS: StaffRoleSnapshot = {
  key: "logistique",
  label: "Logistique",
  grants: [
    { resource: "b2b_orders", action: "write" },
    { resource: "b2b_alerts", action: "read" },
  ],
  archivedAt: null,
};

/** Une date d'archivage : comparée à rien, seule sa présence compte. */
const ARCHIVED_AT = new Date(0);

describe("les faits des rôles", () => {
  it("crée : le libellé EN BASE et ses droits, libellés compris", () => {
    const fact = roleCreatedFact(LOGISTICS);

    expect(fact).toEqual({
      type: STAFF_ROLE_FACTS.created,
      subjectType: "staff_role",
      subjectId: "logistique",
      payload: {
        label: "Logistique",
        grants: [
          {
            resource: "b2b_orders",
            resourceLabel: STAFF_RESOURCE_LABELS.b2b_orders,
            action: "write",
          },
          {
            resource: "b2b_alerts",
            resourceLabel: STAFF_RESOURCE_LABELS.b2b_alerts,
            action: "read",
          },
        ],
      },
    });
  });

  it("n'écrit rien pour une redéfinition identique", () => {
    expect(roleUpdatedFact(LOGISTICS, { ...LOGISTICS })).toBeNull();
  });

  it("dit ce qui a changé : ajouté, retiré, modifié (avec le NOUVEAU niveau)", () => {
    const after: StaffRoleSnapshot = {
      ...LOGISTICS,
      grants: [
        { resource: "b2b_orders", action: "read" },
        { resource: "b2b_payments", action: "read" },
      ],
    };

    expect(roleUpdatedFact(LOGISTICS, after)?.payload).toEqual({
      label: "Logistique",
      previousLabel: null,
      added: [
        {
          resource: "b2b_payments",
          resourceLabel: STAFF_RESOURCE_LABELS.b2b_payments,
          action: "read",
        },
      ],
      removed: [
        { resource: "b2b_alerts", resourceLabel: STAFF_RESOURCE_LABELS.b2b_alerts, action: "read" },
      ],
      changed: [
        { resource: "b2b_orders", resourceLabel: STAFF_RESOURCE_LABELS.b2b_orders, action: "read" },
      ],
    });
  });

  it("fige l'ancien libellé d'un rôle renommé", () => {
    const fact = roleUpdatedFact(LOGISTICS, { ...LOGISTICS, label: "Expédition" });

    expect(fact?.payload).toMatchObject({ label: "Expédition", previousLabel: "Logistique" });
  });

  it("archive et restaure, et se tait quand l'état ne bouge pas", () => {
    const archived = { ...LOGISTICS, archivedAt: ARCHIVED_AT };

    expect(roleArchivedFact(LOGISTICS)?.payload).toEqual({ label: "Logistique" });
    expect(roleArchivedFact(archived)).toBeNull();
    expect(roleRestoredFact(archived)?.type).toBe(STAFF_ROLE_FACTS.restored);
    expect(roleRestoredFact(LOGISTICS)).toBeNull();
  });
});
