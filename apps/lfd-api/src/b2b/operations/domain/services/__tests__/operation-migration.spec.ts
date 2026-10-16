import type { OperationRecord, ReferentialOperation } from "../../entities/operation.js";
import {
  planOperationMigration,
  type MigrationRestriction,
  type MigrationSources,
  type MirroredOperation,
} from "../operation-migration.js";

/**
 * Le plan de la migration des opérations au commerce (lot 3). Les dates ne
 * sont comparées qu'entre elles — l'horloge n'y sert qu'à signer le jugement
 * de l'agrégat —, elles peuvent donc rester absolues.
 */
const NOW = new Date("2026-10-16T08:00:00.000Z");
const IMAGE = "https://media.test/buche.webp";

function referential(over: Partial<ReferentialOperation> = {}): ReferentialOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: { fr: "La bûche revient" },
    image: { url: IMAGE },
    schedule: {
      announceFrom: new Date("2026-11-01T08:00:00.000Z"),
      orderFrom: new Date("2026-11-15T08:00:00.000Z"),
      orderUntil: new Date("2026-12-20T11:00:00.000Z"),
      pickupFrom: "2026-12-22",
      pickupUntil: "2026-12-24",
    },
    audience: "both",
    skus: ["BUC-001-1", "GAL-002-1"],
    hidden: false,
    archivedAt: null,
    ...over,
  };
}

/** La copie du dernier envoi — par défaut, identique au référentiel. */
function mirrored(
  restriction: MigrationRestriction | null = null,
  over: Partial<OperationRecord> = {},
): MirroredOperation {
  return { record: { ...referential(), lastWrite: null, ...over }, restriction };
}

function restriction(over: Partial<MigrationRestriction> = {}): MigrationRestriction {
  return {
    isHidden: false,
    orderUntil: null,
    audience: null,
    hiddenSkus: [],
    decidedBy: "staff_reception",
    decidedAt: new Date("2026-10-10T09:00:00.000Z"),
    ...over,
  };
}

function plan(over: Partial<MigrationSources> = {}) {
  return planOperationMigration({
    referential: [referential()],
    mirror: [mirrored()],
    unknownSkus: new Set(),
    focals: new Map([[IMAGE, { x: 0.3, y: 0.7 }]]),
    now: NOW,
    ...over,
  });
}

function field(line: ReturnType<typeof plan>[number] | undefined, name: string) {
  return line?.fields.find((candidate) => candidate.field === name);
}

describe("planOperationMigration", () => {
  it("reprend une copie identique au référentiel : rien d'autre que la signature ne change", () => {
    const [line] = plan();

    expect(line).toMatchObject({ key: "noel-2026", outcome: "adopt", problems: [] });
    expect(line?.fields.every((candidate) => candidate.explanation === "same")).toBe(true);
    expect(line?.values?.image).toEqual({ url: IMAGE, focal: { x: 0.3, y: 0.7 } });
  });

  it("restreint par la surcharge : la clôture la plus tôt, la sélection sans les retirés, l'intersection", () => {
    const earlier = new Date("2026-12-18T11:00:00.000Z");
    const [line] = plan({
      mirror: [
        mirrored(restriction({ orderUntil: earlier, audience: "pro", hiddenSkus: ["GAL-002-1"] })),
      ],
    });

    expect(line?.outcome).toBe("adopt");
    expect(line?.values).toMatchObject({
      schedule: { orderUntil: earlier },
      audience: "pro",
      skus: ["BUC-001-1"],
      hidden: false,
    });
    expect(field(line, "orderUntil")).toMatchObject({
      referential: "2026-12-20T11:00:00.000Z",
      mirror: earlier.toISOString(),
      result: earlier.toISOString(),
      restricted: true,
      explanation: "same",
    });
    expect(line?.restriction).toMatchObject({ decidedBy: "staff_reception" });
  });

  it("une surcharge plus tardive que le référentiel ne change rien — c'est le plus tôt qui ferme", () => {
    const [line] = plan({
      mirror: [mirrored(restriction({ orderUntil: new Date("2026-12-24T11:00:00.000Z") }))],
    });

    expect(line?.values?.schedule.orderUntil).toEqual(new Date("2026-12-20T11:00:00.000Z"));
  });

  it("une intersection vide masque l'opération et laisse la clientèle du référentiel", () => {
    const [line] = plan({
      referential: [referential({ audience: "public" })],
      mirror: [mirrored(restriction({ audience: "pro" }), { audience: "public" })],
    });

    expect(line?.values).toMatchObject({ audience: "public", hidden: true });
    expect(field(line, "hidden")).toMatchObject({ result: "true", explanation: "same" });
  });

  it("le référentiel édité depuis l'envoi : l'écart est expliqué, et la source gagne", () => {
    const [line] = plan({ referential: [referential({ name: { fr: "Noël 2026" } })] });

    expect(line?.outcome).toBe("adopt");
    expect(field(line, "name")).toMatchObject({
      referential: "Noël 2026",
      mirror: "Noël",
      result: "Noël 2026",
      explanation: "referential_newer",
    });
  });

  it("une opération jamais envoyée est créée, ses articles inconnus du commerce écartés et nommés", () => {
    const [line] = plan({ mirror: [], unknownSkus: new Set(["GAL-002-1"]) });

    expect(line).toMatchObject({ outcome: "create", droppedSkus: ["GAL-002-1"] });
    expect(line?.values?.skus).toEqual(["BUC-001-1"]);
    expect(field(line, "skus")).toMatchObject({ mirror: null, explanation: "not_in_mirror" });
  });

  it("un écart que rien n'explique bloque", () => {
    // Le commerce ne connaîtrait plus un article que l'envoi portait : impossible
    // en pratique (un SKU n'est jamais réattribué), et c'est pour ça qu'il bloque.
    const [line] = plan({ unknownSkus: new Set(["GAL-002-1"]) });

    expect(line).toMatchObject({ outcome: "blocked", values: null });
    expect(field(line, "skus")?.explanation).toBe("unexplained");
    expect(line?.problems).toHaveLength(1);
  });

  it("une fenêtre de commande vidée par la surcharge bloque, avec la phrase de l'agrégat", () => {
    const [line] = plan({
      mirror: [mirrored(restriction({ orderUntil: new Date("2026-11-10T08:00:00.000Z") }))],
    });

    expect(line?.outcome).toBe("blocked");
    expect(line?.problems.join(" ")).toMatch(/fermeraient/u);
  });

  it("ne reprend ni une opération déjà écrite au commerce, ni une copie retirée", () => {
    const lines = plan({
      referential: [referential(), referential({ key: "paques-2027" })],
      mirror: [
        mirrored(null, { lastWrite: { by: "staff_1", at: NOW }, skus: [] }),
        mirrored(null, { key: "paques-2027", archivedAt: NOW }),
      ],
    });

    expect(lines.map((line) => [line.key, line.outcome, line.values])).toEqual([
      ["noel-2026", "already_at_commerce", null],
      ["paques-2027", "archived_unchanged", null],
    ]);
    expect(field(lines[0], "skus")).toMatchObject({
      result: "",
      explanation: "held_at_commerce",
    });
  });

  it("liste une clé du miroir absente du référentiel, sans l'inventer", () => {
    const lines = plan({ referential: [] });

    expect(lines).toEqual([
      expect.objectContaining({ key: "noel-2026", outcome: "mirror_only", values: null }),
    ]);
    expect(field(lines[0], "name")?.referential).toBeNull();
  });
});
