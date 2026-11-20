import { SubAccountMenu } from "../../entities/sub-account-menu.js";
import { NotASubAccountError } from "../../errors/hierarchy-errors.js";
import { PrincipalSitesMenu } from "../../entities/principal-sites-menu.js";
import {
  DuplicateMenuEntryError,
  EmptyMenuReferenceError,
  NotAPrincipalError,
} from "../../errors/sub-account-menu-errors.js";
import type { MenuStamp } from "../../value-objects/sub-account-menu-terms.js";
import { setWholeMenu, setWholeSitesMenu, type WholeMenuContext } from "../whole-menu.js";

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

describe("setWholeMenu — la carte propre d'un site qui suivait la carte commune", () => {
  const SAME = {
    mode: "except",
    offMenu: "visible_locked",
    entries: [
      { level: "family", ref: "fam_patisserie", effect: "exclude" },
      { level: "product", ref: "TARTE", effect: "include" },
    ],
  } as const;

  it("enregistrer la même carte la réactive : ce n'est pas un rejeu", () => {
    const current = existing();
    current.switchState("follows_common", BEFORE);
    const menu = setWholeMenu(current, context(), SAME);
    expect(menu?.state).toBe("own");
    expect(menu?.entries.map((entry) => entry.id)).toEqual(["ent_fam", "ent_tarte"]);
  });

  it("la même carte active, rejouée, n'écrit rien", () => {
    expect(setWholeMenu(existing(), context(), SAME)).toBeNull();
  });
});

describe("setWholeSitesMenu — la carte commune entière", () => {
  const ctx = (parentCompanyId: string | null) => {
    let n = 0;
    return { companyId: "co_principal", parentCompanyId, stamp: NOW, nextId: () => `c_${++n}` };
  };
  const REQUESTED = {
    mode: "only",
    offMenu: "hidden",
    entries: [{ level: "family", ref: "fam_vienno", effect: "include" }],
  } as const;

  it("compose une carte commune absente, et ne réécrit pas la même", () => {
    const menu = setWholeSitesMenu(null, ctx(null), REQUESTED);
    expect(menu?.entries).toEqual([
      { id: "c_1", level: "family", ref: "fam_vienno", effect: "include" },
    ]);
    expect(setWholeSitesMenu(menu, ctx(null), REQUESTED)).toBeNull();
  });

  it("recompose par les mêmes méthodes que la carte d'un site", () => {
    const current = setWholeSitesMenu(null, ctx(null), REQUESTED);
    const menu = setWholeSitesMenu(current, ctx(null), {
      ...REQUESTED,
      mode: "except",
      entries: [],
    });
    expect(menu).toBeInstanceOf(PrincipalSitesMenu);
    expect(menu?.mode).toBe("except");
    expect(menu?.entries).toEqual([]);
  });

  it("refuse une carte commune sur un site", () => {
    expect(() => setWholeSitesMenu(null, ctx("co_other"), REQUESTED)).toThrow(NotAPrincipalError);
  });
});
