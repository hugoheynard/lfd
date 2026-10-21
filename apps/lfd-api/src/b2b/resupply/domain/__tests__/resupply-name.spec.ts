import { resupplyNameOf } from "../resupply-name.js";
import { SiteResupply } from "../site-resupply.js";
import { ResupplyAlreadyPlacedError, ResupplyNameTooLongError } from "../site-resupply-errors.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/** 17 h à Paris le 2 janvier : seule date du fichier, comparée à elle-même. */
const EVENING = new Date("2026-01-02T16:00:00Z");
const TRACE = { at: EVENING, author: { staffUserId: "s", name: "Lou", role: "counter" } };

function draft(): SiteResupply {
  const resupply = SiteResupply.draft({ id: "rs1", siteId: "site_1", target: "asap", at: EVENING });
  resupply.addLine(SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 2 }));
  return resupply;
}

describe("le nom d'un réassort (R1g)", () => {
  it("est rogné, ses blancs intérieurs ramenés à un espace", () => {
    expect(resupplyNameOf("  Vitrine   du\nmatin ")).toBe("Vitrine du matin");
  });

  it.each([null, "", "   "])("vide (%p), il n'y a pas de nom", (raw) => {
    expect(resupplyNameOf(raw)).toBeNull();
  });

  it("tient 60 caractères, accents compris, et refuse le 61ᵉ sans tronquer", () => {
    expect(resupplyNameOf("é".repeat(60))).toBe("é".repeat(60));
    expect(() => resupplyNameOf("a".repeat(61))).toThrow(ResupplyNameTooLongError);
  });

  it("un brouillon naît sans nom, se nomme, se renomme et perd son nom", () => {
    const resupply = draft();
    expect(resupply.name).toBeNull();
    resupply.rename(" Vitrine du matin ");
    expect(resupply.name).toBe("Vitrine du matin");
    resupply.rename("Goûter");
    expect(resupply.name).toBe("Goûter");
    resupply.rename("");
    expect(resupply.name).toBeNull();
  });

  it("envoyé, il ne se renomme plus, et garde son nom", () => {
    const resupply = draft();
    resupply.rename("Vitrine du matin");
    resupply.place(TRACE, null, false);
    expect(() => resupply.rename("Autre")).toThrow(ResupplyAlreadyPlacedError);
    expect(resupply.name).toBe("Vitrine du matin");
  });

  it("le fournil le pose à l'envoi, et un nom trop long refuse l'envoi entier", () => {
    const lines = [SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 2 })];
    const base = { id: "rs2", siteId: "site_1", target: "asap" as const, lines, trace: TRACE };
    const sent = SiteResupply.sentByBakehouse({
      ...base,
      name: "Vitrine du soir",
      deadline: null,
      planStopped: false,
    });
    expect(sent).toMatchObject({ name: "Vitrine du soir", status: "placed" });
    expect(() =>
      SiteResupply.sentByBakehouse({
        ...base,
        name: "x".repeat(61),
        deadline: null,
        planStopped: false,
      }),
    ).toThrow(ResupplyNameTooLongError);
  });

  it("se relit tel quel de l'instantané", () => {
    const resupply = draft();
    resupply.rename("Vitrine du matin");
    const restored = SiteResupply.restore({
      id: resupply.id,
      siteId: resupply.siteId,
      target: resupply.target,
      serviceDay: resupply.serviceDay,
      version: 1,
      origin: resupply.origin,
      name: resupply.name,
      lines: resupply.lines,
      placed: null,
      cancelled: null,
    });
    expect(restored.name).toBe("Vitrine du matin");
  });
});
