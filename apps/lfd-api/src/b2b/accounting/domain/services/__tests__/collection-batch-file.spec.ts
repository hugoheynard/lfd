import { assembleCollection } from "../collection-assembly.js";
import { renderBatchFile, sha256Of } from "../collection-batch-file.js";
import { BATCH_ID, CREDITOR, ENTITY_ID, SEPTEMBER, mandate, order } from "./collection-fixtures.js";

const CONSTITUTED_AT = new Date("2026-10-02T09:15:00.000Z");

function debits() {
  const result = assembleCollection({
    legalEntityId: ENTITY_ID,
    at: CONSTITUTED_AT,
    cycleStartsAt: SEPTEMBER.startsAt,
    orders: [order("c_port", { placedAt: new Date("2026-08-10T08:00:00.000Z") }), order("c_port")],
    follows: [],
    mandates: [mandate("c_port")],
    collectionForms: new Map(),
    consumedMandates: new Set(),
    companyNames: new Map([["c_port", "Boulangerie du Port"]]),
    liveSchemes: [],
  });
  return result.debits.get("B2B") ?? [];
}

function render(unmandated: readonly string[] = []) {
  return renderBatchFile({
    batchId: BATCH_ID,
    creditor: CREDITOR,
    scheme: "B2B",
    cycle: SEPTEMBER,
    constitutedAt: CONSTITUTED_AT,
    debits: debits(),
    unmandatedCompanies: unmandated,
  });
}

describe("le fichier d'un lot", () => {
  it("porte les identifiants du LOT, CreDtTm = la constitution, et les reprises en RmtInf", () => {
    const file = render();

    expect(file.xml).toContain(`<MsgId>${BATCH_ID}</MsgId>`);
    expect(file.xml).toContain(`<PmtInfId>${BATCH_ID}-RCUR</PmtInfId>`);
    expect(file.xml).toContain(`<EndToEndId>${BATCH_ID}-0001</EndToEndId>`);
    expect(file.xml).toContain("<CreDtTm>2026-10-02T11:15:00</CreDtTm>");
    expect(file.xml).toContain("dont 1 de cycles anterieurs");
    expect(file.xml).not.toContain("BROUILLON");
  });

  it("la ligne garde ses commandes et le rang de son EndToEndId", () => {
    const [line] = render().lines;

    expect(line).toMatchObject({ rank: 1, endToEndId: `${BATCH_ID}-0001`, amountCents: 2_000 });
    expect(line?.orderIds).toHaveLength(2);
  });

  it("est déterministe, et son empreinte est celle de ses octets", () => {
    const first = render();

    expect(render().xml).toBe(first.xml);
    expect(first.sha256).toBe(sha256Of(first.xml));
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("crie BROUILLON et nomme la société sans mandat (Q2)", () => {
    const xml = render(["Chalet Sans Mandat"]).xml;

    expect(xml).toContain("CE FICHIER NE PEUT PAS ETRE DEPOSE");
    expect(xml).toContain("Chalet Sans Mandat");
  });
});
