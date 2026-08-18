import { commitmentFor, isRunningAt } from "../volume-commitment.js";
import {
  InvalidPromisedVolumeError,
  ReversedValidityWindowError,
  ScopeIdMismatchError,
  ArchivedVolumeCommitmentIsSealedError,
} from "../pricing-errors.js";
import { VolumeCommitmentAggregate } from "../entities/volume-commitment.js";
import type { VolumeCommitment } from "../volume-commitment.js";

const JANVIER = new Date("2026-01-01T00:00:00.000Z");
const JUILLET = new Date("2026-07-01T00:00:00.000Z");
const DECEMBRE = new Date("2026-12-31T00:00:00.000Z");

function commitment(over: Partial<VolumeCommitment> = {}): VolumeCommitment {
  return {
    id: "cmt",
    companyId: "cmp_dupont",
    scope: { type: "product", id: "VIE-001" },
    promisedQuantity: 6000,
    validFrom: JANVIER,
    validTo: DECEMBRE,
    ...over,
  };
}

const TARGET = { categoryId: "cat_vien", productSku: "VIE-001", variantSku: "VIE-001" };

describe("isRunningAt", () => {
  it("borne basse INCLUSE, borne haute EXCLUE", () => {
    expect(isRunningAt(commitment(), JANVIER)).toBe(true);
    expect(isRunningAt(commitment(), DECEMBRE)).toBe(false);
    expect(isRunningAt(commitment(), JUILLET)).toBe(true);
  });

  it("ne court pas avant son ouverture", () => {
    expect(isRunningAt(commitment(), new Date("2025-12-31T23:59:59.000Z"))).toBe(false);
  });
});

describe("commitmentFor", () => {
  it("retient celui qui vise l'article", () => {
    const found = commitmentFor([commitment()], TARGET, JUILLET);

    expect(found?.id).toBe("cmt");
  });

  it("ignore celui dont la période est passée", () => {
    const clos = commitment({ validTo: JUILLET });

    expect(commitmentFor([clos], TARGET, DECEMBRE)).toBeNull();
  });

  it("ignore celui qui vise un autre article", () => {
    const ailleurs = commitment({ scope: { type: "product", id: "PAI-001" } });

    expect(commitmentFor([ailleurs], TARGET, JUILLET)).toBeNull();
  });

  /**
   * Deux engagements peuvent coexister sur des cibles DIFFÉRENTES — la famille
   * et l'article. La contrainte d'exclusion n'interdit que les jumeaux ; c'est
   * ici que le plus précis l'emporte, comme partout ailleurs dans ce contexte.
   */
  it("le plus spécifique gagne : l'article bat sa famille", () => {
    const famille = commitment({ id: "fam", scope: { type: "category", id: "cat_vien" } });
    const article = commitment({ id: "art", scope: { type: "product", id: "VIE-001" } });

    expect(commitmentFor([famille, article], TARGET, JUILLET)?.id).toBe("art");
    expect(commitmentFor([article, famille], TARGET, JUILLET)?.id).toBe("art");
  });

  it("un engagement de catalogue couvre tout", () => {
    const partout = commitment({ scope: { type: "global", id: null } });

    expect(commitmentFor([partout], TARGET, JUILLET)?.id).toBe("cmt");
  });
});

describe("VolumeCommitmentAggregate.sign", () => {
  const sign = (over: Partial<Parameters<typeof VolumeCommitmentAggregate.sign>[1]> = {}) =>
    VolumeCommitmentAggregate.sign(
      "cmt_1",
      {
        companyId: "cmp_dupont",
        scope: { type: "product", id: "VIE-001" },
        promisedQuantity: 6000,
        validFrom: JANVIER,
        validTo: DECEMBRE,
        ...over,
      },
      "auth0|cecile",
    );

  it("accepte un engagement bien formé et retient qui l'a signé", () => {
    expect(sign().toPersistence()).toMatchObject({ id: "cmt_1", createdBy: "auth0|cecile" });
  });

  it("refuse une période qui se ferme avant de s'ouvrir", () => {
    expect(() => sign({ validFrom: DECEMBRE, validTo: JANVIER })).toThrow(
      ReversedValidityWindowError,
    );
  });

  /** Un engagement à zéro n'engage à rien, et le suivi afficherait une alerte. */
  it("refuse un volume visé nul", () => {
    expect(() => sign({ promisedQuantity: 0 })).toThrow(InvalidPromisedVolumeError);
  });

  it("refuse une portée dont l'identifiant contredit le type", () => {
    expect(() => sign({ scope: { type: "global", id: "VIE-001" } })).toThrow(ScopeIdMismatchError);
  });
});

describe("VolumeCommitmentAggregate.close", () => {
  const signed = VolumeCommitmentAggregate.sign(
    "cmt_1",
    {
      companyId: "cmp_dupont",
      scope: { type: "product", id: "VIE-001" },
      promisedQuantity: 6000,
      validFrom: JANVIER,
      validTo: DECEMBRE,
    },
    "auth0|cecile",
  );

  it("consigne qui a clos, quand et pourquoi", () => {
    const closed = signed.close("auth0|hugo", JUILLET, "Rupture commerciale");

    expect(closed.toPersistence()).toMatchObject({
      archivedAt: JUILLET,
      archivedBy: "auth0|hugo",
      archiveReason: "Rupture commerciale",
    });
  });

  /** La clôture ne révise rien : la période et le volume visé restent intacts. */
  it("ne touche ni la période ni le volume visé", () => {
    const closed = signed.close("auth0|hugo", JUILLET, null);

    expect(closed.asCommitment).toMatchObject({
      promisedQuantity: 6000,
      validFrom: JANVIER,
      validTo: DECEMBRE,
    });
  });

  it("refuse de clore deux fois", () => {
    const closed = signed.close("auth0|hugo", JUILLET, null);

    expect(() => closed.close("auth0|hugo", DECEMBRE, null)).toThrow(
      ArchivedVolumeCommitmentIsSealedError,
    );
  });
});
