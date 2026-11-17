/**
 * E2E : **le fournil est agnostique de l'état de vente** (décidé par Hugo le
 * 2026-11-17 ; `fournil/les-postes-du-fournil.md`), sur le vrai Postgres
 * jetable. Un article masqué, réservé aux particuliers ou retiré se range
 * sous son vrai rayon, en mode boutique comme en mode prod, sur la fiche
 * d'atelier comme dans le dossier du jour. Seul un SKU absent du miroir
 * tombe en « Hors catalogue ».
 */
import { Buffer } from "node:buffer";

import type { ProductionWorksheetView } from "@lfd/contracts";

import type { ProducibleOrder } from "../src/production/channels/commerce/index.js";
import { ProductionDayRepository, ServiceDay } from "../src/production/day/index.js";
import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsRepository,
} from "../src/production/shared/print/index.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

/** L'instant de l'arrêt : recopié, jamais comparé à l'horloge. */
const CLOSED_AT = new Date("2026-11-15T18:00:00.000Z");
const NONE = new Set<string>();

/** Masqué aux deux clientèles. */
const HIDDEN = "VIE-002-1";
/** Retiré du catalogue après la commande. */
const WITHDRAWN = "VIE-004-1";
/** Réservé aux particuliers : un pro ne le voit pas. */
const PUBLIC_ONLY = "PAI-001-1";
const UNKNOWN = "NOPE-1";

function order(sku: string): ProducibleOrder {
  return {
    orderId: `ord_${sku}`,
    reference: `REF-${sku}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: [
      { sku, productName: `Article ${sku}`, quantity: 2, saleUnit: "piece", madeToOrder: null },
    ],
  };
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogItemOverride.create({
    data: { sku: HIDDEN, isHidden: true, isHiddenPublic: true },
  });
  await ctx.prisma.catalogItem.update({
    where: { sku: WITHDRAWN },
    data: { withdrawnAt: CLOSED_AT },
  });
  await ctx.prisma.catalogItem.update({
    where: { sku: PUBLIC_ONLY },
    data: { audience: "public" },
  });
});

async function closeDay(day: string, skus: readonly string[]): Promise<void> {
  const days = ctx.app.get(ProductionDayRepository);
  const loaded = await days.load(ServiceDay.of(day));
  loaded.close(skus.map(order), NONE, CLOSED_AT, null);
  await days.save(loaded);
}

async function prodMode(): Promise<void> {
  await ctx.app
    .get(ProductionDisplaySettingsRepository)
    .save(
      ProductionDisplaySettings.of({ showSubcategories: false, grouping: "workstation" }),
      CLOSED_AT,
      { staffUserId: E2E_STAFF_ID, name: null },
    );
}

async function worksheet(day: string): Promise<ProductionWorksheetView> {
  return jsonBody<ProductionWorksheetView>(
    await admin(ctx).get(`/admin/production/worksheet?date=${day}`).expect(200),
  );
}

async function dossierText(day: string): Promise<string> {
  const response = await admin(ctx)
    .get(`/admin/production/batch/${day}/dossier.pdf`)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    })
    .expect(200);
  return Buffer.isBuffer(response.body) ? pdfPages(response.body).join("\n") : "";
}

function keysOf(sheet: ProductionWorksheetView): readonly (readonly [string, string])[] {
  return sheet.groups.flatMap((group) => group.lines.map((line) => [line.sku, group.key] as const));
}

describe("La fiche d'atelier range un article qui ne se vend plus sous son rayon", () => {
  it("en mode boutique ; seul un SKU inconnu est « Hors catalogue »", async () => {
    const day = serviceDay(1);
    await closeDay(day, [HIDDEN, WITHDRAWN, PUBLIC_ONLY, UNKNOWN]);

    const sheet = await worksheet(day);

    expect(sheet.shelvesKnown).toBe(true);
    expect(new Map(keysOf(sheet))).toEqual(
      new Map([
        [HIDDEN, "fam-vien"],
        [WITHDRAWN, "fam-vien"],
        [PUBLIC_ONLY, "fam-pains"],
        [UNKNOWN, "?"],
      ]),
    );
    expect(sheet.groups.find((group) => group.key === "?")?.label).toBe("Hors catalogue");
  });

  it("en mode prod, rangé « à ranger » sous son rayon", async () => {
    await prodMode();
    const day = serviceDay(1);
    await closeDay(day, [HIDDEN, WITHDRAWN, PUBLIC_ONLY, UNKNOWN]);

    const sheet = await worksheet(day);

    expect(new Map(keysOf(sheet))).toEqual(
      new Map([
        [HIDDEN, "fam-vien"],
        [WITHDRAWN, "fam-vien"],
        [PUBLIC_ONLY, "fam-pains"],
        [UNKNOWN, "?"],
      ]),
    );
    expect(sheet.groups.filter((group) => group.key !== "?").every((group) => group.unplaced)).toBe(
      true,
    );
  });
});

describe("Le dossier du jour range un article qui ne se vend plus sous son rayon", () => {
  it("en mode boutique, sans « Hors catalogue »", async () => {
    const day = serviceDay(1);
    await closeDay(day, [HIDDEN, WITHDRAWN, PUBLIC_ONLY]);

    const text = await dossierText(day);

    expect(text).toContain("Viennoiseries");
    expect(text).toContain("Pains");
    expect(text).not.toContain("Hors catalogue");
  });

  it("en mode prod, « à ranger » sous son rayon, sans « Hors catalogue »", async () => {
    await prodMode();
    const day = serviceDay(1);
    await closeDay(day, [HIDDEN, WITHDRAWN, PUBLIC_ONLY]);

    const text = await dossierText(day);

    // Le tiret cadratin ne survit pas à l'extraction du texte du PDF.
    expect(text).toMatch(/Viennoiseries\s+.?\s*à ranger/);
    expect(text).toMatch(/Pains\s+.?\s*à ranger/);
    expect(text).not.toContain("Hors catalogue");
  });
});
