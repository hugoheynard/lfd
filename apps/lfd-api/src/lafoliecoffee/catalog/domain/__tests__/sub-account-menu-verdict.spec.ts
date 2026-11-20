import type {
  MenuReading,
  MenuReadingEntry,
} from "../../../shared/company-standing/domain/sub-account-menu-reading.js";
import { menuMarkOf, type MenuSubject } from "../sub-account-menu-verdict.js";

/**
 * Le grain et les deux modes de la carte (`carte-des-sites.md`, § 3.3,
 * § 7) : SKU contre produit contre famille contre famille parente, et
 * l'exception d'une exception.
 */

const LEMON_TART: MenuSubject = {
  sku: "PAT-004-2",
  productSku: "PAT-004",
  familyPath: ["fam_tartes", "fam_patisserie"],
};
const ECLAIR: MenuSubject = {
  sku: "PAT-007-1",
  productSku: "PAT-007",
  familyPath: ["fam_choux", "fam_patisserie"],
};
const CROISSANT: MenuSubject = {
  sku: "VIE-001-1",
  productSku: "VIE-001",
  familyPath: ["fam_viennoiserie"],
};

function menu(mode: MenuReading["mode"], entries: readonly MenuReadingEntry[]): MenuReading {
  return { mode, offMenu: "visible_locked", entries };
}

const exclude = (level: MenuReadingEntry["level"], ref: string): MenuReadingEntry => ({
  level,
  ref,
  effect: "exclude",
});
const include = (level: MenuReadingEntry["level"], ref: string): MenuReadingEntry => ({
  level,
  ref,
  effect: "include",
});

describe("menuMarkOf — sans carte", () => {
  it("tout est dans la carte", () => {
    expect(menuMarkOf(null, LEMON_TART)).toBe("on");
  });
});

describe("menuMarkOf — `except` (tout sauf…)", () => {
  it("sans entrée qui touche l'article : ouvert", () => {
    expect(menuMarkOf(menu("except", []), CROISSANT)).toBe("on");
  });

  it("la famille PARENTE exclue ferme ses sous-familles", () => {
    const card = menu("except", [exclude("family", "fam_patisserie")]);
    expect(menuMarkOf(card, LEMON_TART)).toBe("off");
    expect(menuMarkOf(card, ECLAIR)).toBe("off");
    expect(menuMarkOf(card, CROISSANT)).toBe("on");
  });

  it("« tout sauf Pâtisserie, mais les tartes » : la famille la plus proche l'emporte", () => {
    const card = menu("except", [
      exclude("family", "fam_patisserie"),
      include("family", "fam_tartes"),
    ]);
    expect(menuMarkOf(card, LEMON_TART)).toBe("on");
    expect(menuMarkOf(card, ECLAIR)).toBe("off");
  });

  it("le produit l'emporte sur la famille, le SKU sur le produit", () => {
    const card = menu("except", [
      exclude("family", "fam_patisserie"),
      include("product", "PAT-004"),
      exclude("sku", "PAT-004-2"),
    ]);
    expect(menuMarkOf(card, LEMON_TART)).toBe("off");
    expect(menuMarkOf(card, { ...LEMON_TART, sku: "PAT-004-1" })).toBe("on");
  });

  it("l'ordre des entrées ne compte pas, seul le grain", () => {
    const card = menu("except", [include("sku", "PAT-004-2"), exclude("family", "fam_patisserie")]);
    expect(menuMarkOf(card, LEMON_TART)).toBe("on");
  });
});

describe("menuMarkOf — `only` (seulement…)", () => {
  it("sans entrée : tout est fermé", () => {
    expect(menuMarkOf(menu("only", []), CROISSANT)).toBe("off");
  });

  it("« seulement la Viennoiserie, sauf le croissant AOP »", () => {
    const card = menu("only", [
      include("family", "fam_viennoiserie"),
      exclude("product", "VIE-001"),
    ]);
    expect(menuMarkOf(card, CROISSANT)).toBe("off");
    expect(menuMarkOf(card, { ...CROISSANT, sku: "VIE-002-1", productSku: "VIE-002" })).toBe("on");
    expect(menuMarkOf(card, LEMON_TART)).toBe("off");
  });

  it("la famille parente incluse ouvre ses sous-familles, sauf celle exclue", () => {
    const card = menu("only", [
      include("family", "fam_patisserie"),
      exclude("family", "fam_choux"),
    ]);
    expect(menuMarkOf(card, LEMON_TART)).toBe("on");
    expect(menuMarkOf(card, ECLAIR)).toBe("off");
  });

  it("un SKU seul inclus n'ouvre que lui", () => {
    const card = menu("only", [include("sku", "PAT-004-2")]);
    expect(menuMarkOf(card, LEMON_TART)).toBe("on");
    expect(menuMarkOf(card, { ...LEMON_TART, sku: "PAT-004-1" })).toBe("off");
  });
});
