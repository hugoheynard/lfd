import { SubAccountMenu } from "../../entities/sub-account-menu.js";
import { NotASubAccountError } from "../../errors/hierarchy-errors.js";
import {
  DuplicateMenuEntryError,
  EmptyMenuReferenceError,
} from "../../errors/sub-account-menu-errors.js";
import type { MenuStamp } from "../../value-objects/sub-account-menu-terms.js";
import { setWholeMenu, type WholeMenuContext } from "../whole-menu.js";

const BEFORE: MenuStamp = { author: { kind: "staff", staffId: "stf_1" }, at: new Date(0) };
const NOW: MenuStamp = { author: { kind: "customer", userId: "usr_1" }, at: new Date(1000) };

function context(principalCompanyId: string | null = "co_principal"): WholeMenuContext {
  let n = 0;
  return {
    companyId: "co_site",
    principalCompanyId,
    stamp: NOW,
    nextId: () => `ent_new_${++n}`,
  };
}

/** « Tout sauf Pâtisserie, mais la tarte au citron », posée avant. */
function existing(): SubAccountMenu {
  const menu = SubAccountMenu.compose({
    companyId: "co_site",
    principalCompanyId: "co_principal",
    mode: "except",
    offMenu: "visible_locked",
    stamp: BEFORE,
  });
  menu.exclude({ id: "ent_fam", level: "family", ref: "fam_patisserie" }, BEFORE);
  menu.include({ id: "ent_tarte", level: "product", ref: "TARTE" }, BEFORE);
  return menu;
}

describe("setWholeMenu — la carte entière, mise à l'état demandé", () => {
  it("compose une carte absente, avec ses entrées et l'auteur du geste", () => {
    const menu = setWholeMenu(null, context(), {
      mode: "only",
      offMenu: "hidden",
      entries: [{ level: "family", ref: " fam_vienno ", effect: "include" }],
    });
    expect(menu?.mode).toBe("only");
    expect(menu?.offMenu).toBe("hidden");
    expect(menu?.entries).toEqual([
      { id: "ent_new_1", level: "family", ref: "fam_vienno", effect: "include" },
    ]);
    expect(menu?.stamp).toEqual(NOW);
  });

  it("refuse une société sans principal, même si une carte y dort", () => {
    const request = { mode: "except", offMenu: "hidden", entries: [] } as const;
    expect(() => setWholeMenu(null, context(null), request)).toThrow(NotASubAccountError);
    expect(() => setWholeMenu(existing(), context(null), request)).toThrow(NotASubAccountError);
  });

  it("rejouée à l'identique, ne rend rien à écrire", () => {
    const menu = setWholeMenu(existing(), context(), {
      mode: "except",
      offMenu: "visible_locked",
      entries: [
        { level: "product", ref: "TARTE", effect: "include" },
        { level: "family", ref: "fam_patisserie", effect: "exclude" },
      ],
    });
    expect(menu).toBeNull();
  });

  it("garde l'identifiant d'une entrée inchangée, retire l'absente, repose celle dont l'effet change", () => {
    const menu = setWholeMenu(existing(), context(), {
      mode: "only",
      offMenu: "hidden",
      entries: [
        { level: "family", ref: "fam_patisserie", effect: "exclude" },
        { level: "product", ref: "TARTE", effect: "exclude" },
        { level: "sku", ref: "CROI-1", effect: "include" },
      ],
    });
    expect(menu?.mode).toBe("only");
    expect(menu?.offMenu).toBe("hidden");
    expect(menu?.entries).toEqual([
      { id: "ent_fam", level: "family", ref: "fam_patisserie", effect: "exclude" },
      { id: "ent_new_1", level: "product", ref: "TARTE", effect: "exclude" },
      { id: "ent_new_2", level: "sku", ref: "CROI-1", effect: "include" },
    ]);
    expect(menu?.stamp).toEqual(NOW);
  });

  it("« pas de restriction » : `except` sans entrée vide la carte, qui reste", () => {
    const menu = setWholeMenu(existing(), context(), {
      mode: "except",
      offMenu: "visible_locked",
      entries: [],
    });
    expect(menu?.entries).toEqual([]);
    expect(menu?.companyId).toBe("co_site");
  });

  it("refuse le même article deux fois au même grain, même d'effets contraires", () => {
    expect(() =>
      setWholeMenu(existing(), context(), {
        mode: "except",
        offMenu: "hidden",
        entries: [
          { level: "sku", ref: "A", effect: "include" },
          { level: "sku", ref: " A", effect: "exclude" },
        ],
      }),
    ).toThrow(DuplicateMenuEntryError);
  });

  it("refuse une référence vide", () => {
    expect(() =>
      setWholeMenu(null, context(), {
        mode: "except",
        offMenu: "hidden",
        entries: [{ level: "sku", ref: "  ", effect: "include" }],
      }),
    ).toThrow(EmptyMenuReferenceError);
  });
});
