import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Lot B du plan des phrases, pour les comptes et paniers, le commerce et la
 * comptabilité : chaque fait nomme son sujet (D6), cite les objets avec leur
 * nom du moment (D5), et les lignes écrites avant restent lisibles (§6.2 — le
 * journal ne se réécrit pas).
 *
 * Les trois règles transverses — un `subjectLabel` par type, aucun id nu,
 * aucun e-mail — sont tenues sur le catalogue entier par `closure.spec.ts`.
 */

describe("les noms figés des comptes, du commerce et de la comptabilité (lot B)", () => {
  it("garde lisibles les lignes du lot A : leur forme est dans l'histoire du type", () => {
    const written: readonly [JournalFactType, unknown][] = [
      ["company.declared", { via: "self", ownerUserId: "user_1" }],
      ["company.kbis_uploaded", { fileName: "kbis.pdf" }],
      ["user.registered", { email: "hello@bistrot.fr" }],
      ["company.default_delivery_set", { addressId: "a1" }],
      ["company.delivery_address_added", { addressId: "a1", ville: "Paris", codePostal: "75011" }],
      [
        "company.delivery_procedure_edited",
        { companyId: "c1", addressId: "a1", action: "step_added" },
      ],
      ["company.contact_removed", { contactId: "ct1" }],
      ["company.access_opened", { userId: "u1", role: "owner" }],
      ["company.client_note_edited_by_staff", { companyId: "c1", action: "notes_reordered" }],
      ["lead.captured", { businessName: "Bistrot", email: "hello@bistrot.fr" }],
      ["lead.converted", { via: "registration", linkedUserId: "u1" }],
      ["appointment.honored", { appointmentId: "apt_1", reason: "", via: "staff" }],
      ["catalog_item.hidden", { sku: "VIE-001-1" }],
      ["legal_entity.archived", {}],
      [
        "payment_mandate.signed",
        { companyId: "c1", reference: "RUM-1", signedAt: "2026-09-10", replacedMandateId: null },
      ],
    ];

    for (const [type, line] of written) {
      const readable = journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
      expect({ type, readable }).toEqual({ type, readable: true });
      // …mais elles ne s'écrivent plus : l'écriture ne connaît que la forme courante.
      expect(checkJournalFact(type, line)).toMatchObject({ kind: "invalid_payload" });
    }
  });

  it("cite une personne sans nom par son seul id — jamais une chaîne vide à sa place", () => {
    const opened = { subjectLabel: "Café des Halles", role: "owner" };

    expect(
      checkJournalFact("company.access_opened", { ...opened, person: { id: "u1" } }),
    ).toBeNull();
    expect(
      checkJournalFact("company.access_opened", { ...opened, person: { id: "u1", name: "" } }),
    ).toMatchObject({ kind: "invalid_payload" });
  });

  it("cite le mandat remplacé par sa RUM, et la société engagée par son nom", () => {
    expect(
      checkJournalFact("payment_mandate.signed", {
        subjectLabel: "RUM-2",
        company: { id: "c1", name: "Café des Halles" },
        reference: "RUM-2",
        signedAt: "2026-09-10",
        replacedMandate: { id: "mdt_1", name: "RUM-1" },
      }),
    ).toBeNull();
  });
});
