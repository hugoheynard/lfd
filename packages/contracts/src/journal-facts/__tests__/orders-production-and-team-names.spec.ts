import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Lot B du plan des phrases, pour les commandes, la production et l'équipe :
 * chaque fait nomme son sujet quand il en a un (D6), cite les objets avec leur
 * nom du moment (D5), la première activation a son fait (D7), et les lignes
 * écrites avant restent lisibles (§6.2 — le journal ne se réécrit pas).
 *
 * Les trois règles transverses — un `subjectLabel` par type, aucun id nu,
 * aucun e-mail — sont tenues sur le catalogue entier par `closure.spec.ts`.
 */

describe("les noms figés des commandes, de la production et de l'équipe (lot B)", () => {
  it("garde lisibles les lignes du lot A : leur forme est dans l'histoire du type", () => {
    const written: readonly [JournalFactType, unknown][] = [
      ["order.ready", { orderId: "o1", orderNumber: "C-1", readyBy: "fiche_1", readyAt: AT }],
      [
        "order.handed_over",
        {
          orderId: "o1",
          orderNumber: "C-1",
          handedOverBy: "fiche_1",
          handedOverAt: AT,
          via: "scan",
        },
      ],
      ["delivery_zone.created", { label: "Paris", postalPrefixes: 2, fee: { cents: 900 } }],
      ["delivery_zone.removed", {}],
      ["pickup_address.removed", {}],
      ["pickup_address.default_set", {}],
      [
        "order_cutoff.created",
        { pickupAddressId: "p1", weekday: null, daysBefore: 1, time: "17:00", graceMinutes: 0 },
      ],
      ["order_cutoff.removed", {}],
      [
        "order_cutoff_waiver.granted",
        { companyId: "cmp_1", fulfillmentDate: "2026-09-21", reason: "Tournée" },
      ],
      ["production_day.closed", { serviceDay: "2026-09-21", absorbed: 2 }],
      [
        "production_container.removed",
        { before: { unitsPerContainer: 4, singular: "a", plural: "b" } },
      ],
      ["staff_user.suspended", { person: { firstName: "Léa", lastName: "Petit" } }],
      [
        "staff_user.identity_edited",
        {
          person: { firstName: "Léa", lastName: "Petit" },
          previous: null,
          fields: ["téléphone"],
          changes: [{ field: "phone", label: "téléphone", from: "", to: "06" }],
        },
      ],
      ["staff_role.archived", { label: "Logistique" }],
    ];

    for (const [type, line] of written) {
      const readable = journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
      expect({ type, readable }).toEqual({ type, readable: true });
      // …mais elles ne s'écrivent plus : l'écriture ne connaît que la forme courante.
      // Sauf les faits de commande, dont la forme courante ADMET l'ancienne : un
      // client sans nom et une fiche que l'annuaire ne nomme pas s'y écrivent
      // encore ainsi, sans rien inventer.
      const stillWritable = type === "order.ready" || type === "order.handed_over";
      expect(checkJournalFact(type, line) === null).toBe(stillWritable);
    }
  });

  it("sépare la première activation du rétablissement (D7) — les deux s'écrivent", () => {
    const line = { subjectLabel: "Léa Petit", person: { firstName: "Léa", lastName: "Petit" } };

    expect(checkJournalFact("staff_user.activated", line)).toBeNull();
    expect(checkJournalFact("staff_user.reinstated", line)).toBeNull();
  });

  it("n'écrit plus `fields` à côté de `changes` : une seule source des champs modifiés", () => {
    const edited = {
      subjectLabel: "Léa Petit",
      person: { firstName: "Léa", lastName: "Petit" },
      previous: null,
      changes: [{ field: "phone", label: "téléphone", from: "", to: "06" }],
    };

    expect(checkJournalFact("staff_user.identity_edited", edited)).toBeNull();
    expect(
      checkJournalFact("staff_user.identity_edited", { ...edited, fields: ["téléphone"] }),
    ).toMatchObject({ kind: "invalid_payload" });
  });

  it("nomme un COMPTE de préfixes postaux sous un nom de compte", () => {
    expect(
      checkJournalFact("delivery_zone.updated", {
        subjectLabel: "Paris",
        label: "Paris",
        postalPrefixCount: 2,
        fee: { bp: 500 },
      }),
    ).toBeNull();
  });
});

/** Un instant quelconque : recopié, comparé à aucune horloge. */
const AT = "2026-09-19T08:00:00.000Z";

describe("le retrait déposé — `deposit`, connu des lecteurs avant d'être écrit (AP-D8)", () => {
  const handedOver = (via: string) => ({
    subjectLabel: "Refuge 1950",
    orderId: "o1",
    orderNumber: "C-1",
    handedOverBy: { id: "fiche_1", name: "Paul Roux" },
    handedOverAt: AT,
    via,
  });

  it("accepte `via: deposit` dans la forme courante du retrait", () => {
    expect(checkJournalFact("order.handed_over", handedOver("deposit"))).toBeNull();
  });

  it("le lit aussi dans la forme d'avant le lot B", () => {
    const line = {
      orderId: "o1",
      orderNumber: "C-1",
      handedOverBy: "fiche_1",
      handedOverAt: AT,
      via: "deposit",
    };
    expect(journalPayloadShapes("order.handed_over").some((s) => s.safeParse(line).success)).toBe(
      true,
    );
  });

  it("refuse toujours une attestation inventée", () => {
    expect(checkJournalFact("order.handed_over", handedOver("presume"))).not.toBeNull();
  });
});

describe("l'arrêt automatique du plan — `automatic` (plan-arret-du-plan, S7, lot A2)", () => {
  const closed = { subjectLabel: "2026-10-07", serviceDay: "2026-10-07", absorbed: 3 };

  it("écrit un arrêt du staff sans la clé, et un arrêt automatique avec `true`", () => {
    expect(checkJournalFact("production_day.closed", closed)).toBeNull();
    expect(checkJournalFact("production_day.closed", { ...closed, automatic: true })).toBeNull();
  });

  it("refuse `automatic: false` : l'absence dit déjà « un geste du staff »", () => {
    expect(
      checkJournalFact("production_day.closed", { ...closed, automatic: false }),
    ).toMatchObject({ kind: "invalid_payload" });
  });

  it("ne l'ouvre pas à la reprise du tirage", () => {
    expect(
      checkJournalFact("production_day.retaken", { ...closed, automatic: true }),
    ).toMatchObject({ kind: "invalid_payload" });
  });
});
