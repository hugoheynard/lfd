import {
  greetingTable,
  PRESENCE,
  presence,
  specimenCase,
  specimenOnly,
  variantCase,
  YES_NO,
  yesNo,
} from "./case-builders.js";
import type { MailCaseTables } from "./mail-specimen-case.types.js";

/** Les cas des e-mails de l'équipe, du contrôle de mise en service et de la vitrine. */

export const TEAM_CASE_TABLES: Pick<
  MailCaseTables,
  | "staff.appointment-booked"
  | "staff.account-alert"
  | "staff.invited"
  | "ops.deploy-check"
  | "staff.password-reset"
  | "staff.access-suspended"
  | "staff.access-restored"
  | "staff.production-dossier"
  | "staff.support-requested"
  | "staff.customer-request"
  | "agency.vitrine-notice"
> = {
  "staff.appointment-booked": {
    cases: [
      specimenCase("staff.appointment-booked", "Avec un message"),
      variantCase("staff.appointment-booked", "no-message", "Sans message ni canal", (data) => ({
        ...data,
        channelLabel: "",
        message: "",
      })),
    ],
    axes: [{ id: "message", values: PRESENCE, of: (data) => presence(data.message) }],
  },
  "staff.account-alert": specimenOnly("staff.account-alert"),
  "staff.invited": greetingTable(
    "staff.invited",
    (data) => data.firstName,
    (data) => ({ ...data, firstName: "" }),
  ),
  "ops.deploy-check": specimenOnly("ops.deploy-check"),
  "staff.password-reset": greetingTable(
    "staff.password-reset",
    (data) => data.firstName,
    (data) => ({ ...data, firstName: "" }),
  ),
  "staff.access-suspended": greetingTable(
    "staff.access-suspended",
    (data) => data.firstName,
    (data) => ({ ...data, firstName: "" }),
  ),
  "staff.access-restored": greetingTable(
    "staff.access-restored",
    (data) => data.firstName,
    (data) => ({ ...data, firstName: "" }),
  ),
  "staff.production-dossier": {
    cases: [
      specimenCase("staff.production-dossier", "Journée arrêtée, sans réassort"),
      variantCase(
        "staff.production-dossier",
        "completed",
        "Journée complétée, sans prénom",
        (data) => ({
          ...data,
          firstName: "",
          arrestedBy: "",
          completed: true,
        }),
      ),
      variantCase("staff.production-dossier", "resupplies", "Avec des réassorts", (data) => ({
        ...data,
        orderCount: 1,
        pickupCount: 0,
        deliveryCount: 0,
        resupplyCount: 2,
        resupplyPieceCount: 18,
        pieceCount: 58,
      })),
    ],
    axes: [
      { id: "completed", values: YES_NO, of: (data) => yesNo(data.completed) },
      { id: "resupplies", values: YES_NO, of: (data) => yesNo(data.resupplyCount > 0) },
      { id: "firstName", values: PRESENCE, of: (data) => presence(data.firstName) },
    ],
  },
  "staff.support-requested": specimenOnly("staff.support-requested"),
  "staff.customer-request": {
    cases: [
      specimenCase("staff.customer-request", "Urgente, complète"),
      variantCase("staff.customer-request", "plain", "Non urgente, sans détail", (data) => ({
        ...data,
        urgent: false,
        orderNumber: "",
        photoCount: 0,
        authorPhone: "",
        clientLabel: "",
        message: "",
      })),
    ],
    axes: [{ id: "urgent", values: YES_NO, of: (data) => yesNo(data.urgent) }],
  },
  "agency.vitrine-notice": specimenOnly("agency.vitrine-notice"),
};
