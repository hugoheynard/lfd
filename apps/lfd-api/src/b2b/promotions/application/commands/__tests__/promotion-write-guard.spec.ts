import {
  BasketPromotionsWouldCombineError,
  OverlappingPromotionError,
  PromotionWrongSurfaceError,
} from "../../../domain/errors/promotion-errors.js";
import { PRICING_SURFACE, type PromotionSurface } from "../../../domain/promotion-surface.js";
import { PromotionAudienceSet } from "../../../domain/promotion-audience-set.js";
import type { PromotionTerms } from "../../../domain/promotion-terms.js";
import {
  FROM,
  UNTIL,
  basketTerms,
  lineTerms,
} from "../../../domain/__tests__/promotion-terms.fixture.js";
import { writeScene } from "../../__tests__/promotion-write.doubles.js";
import { ArchivePromotionCommand } from "../archive-promotion.command.js";
import { PausePromotionCommand } from "../pause-promotion.command.js";
import { PosePromotionCommand } from "../pose-promotion.command.js";
import { ResumePromotionCommand } from "../resume-promotion.command.js";
import { RevisePromotionCommand } from "../revise-promotion.command.js";

const STAFF = "staff_hugo";
const COEUR: PromotionSurface = { kind: "pickup_point", pickupId: "pk_coeur" };
const DAY_MS = 86_400_000;

function onlyFamily(familyId: string): PromotionTerms["scope"] {
  return {
    mode: "only",
    rules: [{ target: "category", targetId: familyId, eligible: true, targetRank: null }],
  };
}

describe("la surface et son droit (§ 13.9)", () => {
  it("refuse de poser une promotion de retrait à un point depuis l'écran Promotions", async () => {
    const s = writeScene(FROM);
    await expect(
      s.pose.execute(new PosePromotionCommand(basketTerms(), STAFF, PRICING_SURFACE)),
    ).rejects.toThrow(PromotionWrongSurfaceError);
  });

  it("refuse depuis un point une promotion qui ne vise pas ce point", async () => {
    const s = writeScene(FROM);
    await expect(
      s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, COEUR)),
    ).rejects.toThrow(PromotionWrongSurfaceError);
    const elsewhere = basketTerms({ fulfillment: { kind: "pickup_point", pickupId: "pk_autre" } });
    await expect(s.pose.execute(new PosePromotionCommand(elsewhere, STAFF, COEUR))).rejects.toThrow(
      PromotionWrongSurfaceError,
    );
  });

  it("refuse de suspendre depuis l'écran Promotions celle d'un point, et de la réviser vers « tous »", async () => {
    const s = writeScene(FROM);
    const id = await s.pose.execute(new PosePromotionCommand(basketTerms(), STAFF, COEUR));
    await expect(
      s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE)),
    ).rejects.toThrow(PromotionWrongSurfaceError);
    await expect(
      s.revise.execute(new RevisePromotionCommand(id, lineTerms(), STAFF, null, COEUR)),
    ).rejects.toThrow(PromotionWrongSurfaceError);
    expect(s.promotions.acts.map((act) => act.kind)).toEqual(["posed"]);
  });
});

describe("le refus de chevauchement (§ 13.2)", () => {
  it("refuse une seconde promotion qui se dispute un article, en nommant l'autre et l'article", async () => {
    const s = writeScene(FROM);
    await s.pose.execute(
      new PosePromotionCommand(
        lineTerms({
          internalName: "Pains d'automne",
          scope: onlyFamily("c_pains"),
          validTo: UNTIL,
        }),
        STAFF,
        PRICING_SURFACE,
      ),
    );
    const refusal = s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE));
    await expect(refusal).rejects.toThrow(OverlappingPromotionError);
    await expect(refusal).rejects.toThrow(
      // `UNTIL` est minuit UTC, donc 1 h à Paris : le 1er décembre est encore couvert.
      "« Pains d'automne » vise déjà tout le monde et couvre « Pain de campagne » du 1er novembre 2026 au 1er décembre 2026",
    );
    expect(s.promotions.stored.size).toBe(1);
  });

  /**
   * RÉÉCRIT en L8b (2026-10-30) : il posait `tout le monde` puis `pros actifs`
   * sur la même famille, deux publics que l'ancien refus (même `kind`)
   * laissait coexister. Le chevauchement se juge désormais sur les
   * COUVERTURES (§ 15.6) — `tout le monde` couvre les pros actifs —, et deux
   * publics ne coexistent plus que s'ils sont disjoints : particuliers / pros
   * actifs.
   */
  it("laisse coexister deux portées disjointes, deux publics disjoints, deux fenêtres qui se suivent", async () => {
    const s = writeScene(FROM);
    const pose = (terms: PromotionTerms) =>
      s.pose.execute(new PosePromotionCommand(terms, STAFF, PRICING_SURFACE));
    const individuals = { kind: "individuals" } as const;
    await pose(lineTerms({ scope: onlyFamily("c_pains"), validTo: UNTIL, audience: individuals }));
    await pose(lineTerms({ scope: onlyFamily("c_viennoiserie"), audience: individuals }));
    await pose(lineTerms({ scope: onlyFamily("c_pains"), audience: { kind: "pros_active" } }));
    await pose(
      lineTerms({ scope: onlyFamily("c_pains"), validFrom: UNTIL, audience: individuals }),
    );
    expect(s.promotions.stored.size).toBe(4);
  });

  it("refuse `pros` contre `pros actifs` : leurs couvertures se croisent (L8b, vitruve n° 3 S4)", async () => {
    const s = writeScene(FROM);
    const pose = (terms: PromotionTerms) =>
      s.pose.execute(new PosePromotionCommand(terms, STAFF, PRICING_SURFACE));
    await pose(lineTerms({ internalName: "Pros", audience: { kind: "pros" } }));
    const refusal = pose(lineTerms({ audience: { kind: "pros_active" } }));
    await expect(refusal).rejects.toThrow(OverlappingPromotionError);
    await expect(refusal).rejects.toThrow("« Pros » vise déjà les pros actifs");
  });

  it("refuse {inscrits, pros} contre {pros} et contre {pros actifs} ; accepte contre {invités}", async () => {
    const s = writeScene(FROM);
    const pose = (terms: PromotionTerms) =>
      s.pose.execute(new PosePromotionCommand(terms, STAFF, PRICING_SURFACE));
    await pose(
      lineTerms({
        internalName: "Inscrits et pros",
        audiences: PromotionAudienceSet.of([{ kind: "individuals_registered" }, { kind: "pros" }]),
      }),
    );
    await expect(pose(lineTerms({ audience: { kind: "pros" } }))).rejects.toThrow(
      "« Inscrits et pros » vise déjà les pros",
    );
    await expect(pose(lineTerms({ audience: { kind: "pros_active" } }))).rejects.toThrow(
      OverlappingPromotionError,
    );
    await pose(lineTerms({ audience: { kind: "individuals_guest" } }));
    expect(s.promotions.stored.size).toBe(2);
  });

  it("au point ligne, une famille ne vise pas l'article au poids ; au panier, si", async () => {
    const s = writeScene(FROM);
    const weightOnly: PromotionTerms["scope"] = {
      mode: "only",
      rules: [
        { target: "category", targetId: "c_pains", eligible: true, targetRank: null },
        { target: "variant", targetId: "PAI-001-1", eligible: false, targetRank: null },
      ],
    };
    await s.pose.execute(
      new PosePromotionCommand(lineTerms({ scope: weightOnly }), STAFF, PRICING_SURFACE),
    );
    await s.pose.execute(
      new PosePromotionCommand(lineTerms({ scope: weightOnly }), STAFF, PRICING_SURFACE),
    );
    await s.pose.execute(
      new PosePromotionCommand(basketTerms({ scope: weightOnly }), STAFF, COEUR),
    );
    await expect(
      s.pose.execute(new PosePromotionCommand(basketTerms({ scope: weightOnly }), STAFF, COEUR)),
    ).rejects.toThrow("« Pain de seigle au poids »");
  });

  /** § 16 : deux cumulables se combinent, elles ne se disputent rien. */
  it("laisse deux cumulables se recouvrir ; refuse une non cumulable face à une cumulable", async () => {
    const s = writeScene(FROM);
    const pose = (terms: PromotionTerms) =>
      s.pose.execute(new PosePromotionCommand(terms, STAFF, PRICING_SURFACE));
    await pose(lineTerms({ internalName: "Cumul A", cumulative: true }));
    await pose(lineTerms({ internalName: "Cumul B", cumulative: true }));
    expect(s.promotions.stored.size).toBe(2);

    await expect(pose(lineTerms({ internalName: "Seule" }))).rejects.toThrow(
      OverlappingPromotionError,
    );
    expect(s.promotions.stored.size).toBe(2);
  });

  it("une rivale en pause garde sa place ; une archivée la rend", async () => {
    const s = writeScene(FROM);
    const id = await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE));
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE));
    await expect(
      s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE)),
    ).rejects.toThrow(OverlappingPromotionError);
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin", PRICING_SURFACE));
    await expect(
      s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE)),
    ).resolves.toBeDefined();
  });

  it("une révision ne se dispute pas avec elle-même, et la reprise d'une pause est jugée", async () => {
    const s = writeScene(FROM);
    const id = await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE));
    await s.revise.execute(
      new RevisePromotionCommand(
        id,
        lineTerms({ effect: { kind: "percent_off", basisPoints: 3000 } }),
        STAFF,
        null,
        PRICING_SURFACE,
      ),
    );
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE));
    await expect(
      s.resume.execute(new ResumePromotionCommand(id, STAFF, null, PRICING_SURFACE)),
    ).resolves.toBeUndefined();
    expect(s.promotions.acts.map((act) => act.kind)).toEqual([
      "posed",
      "replaced",
      "paused",
      "resumed",
    ]);
  });

  it("ne lit pas le catalogue quand aucune autre promotion n'existe", async () => {
    const s = writeScene(FROM);
    await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE));
    expect(s.catalogue.reads).toBe(0);
  });
});

describe("une seule promotion de panier par commande, jusqu'à L12", () => {
  it("laisse coexister la remise des pros actifs et celle des autres, au même point", async () => {
    const s = writeScene(FROM);
    await s.pose.execute(
      new PosePromotionCommand(basketTerms({ audience: { kind: "pros_active" } }), STAFF, COEUR),
    );
    await s.pose.execute(new PosePromotionCommand(basketTerms(), STAFF, COEUR));
    expect(s.promotions.stored.size).toBe(2);
  });

  it("refuse « pros · tout retrait » à côté de « pros actifs · Cœur de station », en la nommant", async () => {
    const s = writeScene(FROM);
    await s.pose.execute(
      new PosePromotionCommand(
        basketTerms({
          internalName: "Remise Cœur pros",
          audience: { kind: "pros_active" },
          scope: onlyFamily("c_viennoiserie"),
        }),
        STAFF,
        COEUR,
      ),
    );
    const combined = basketTerms({
      audience: { kind: "pros" },
      fulfillment: { kind: "pickup" },
      scope: onlyFamily("c_pains"),
    });
    const refusal = s.pose.execute(new PosePromotionCommand(combined, STAFF, PRICING_SURFACE));
    await expect(refusal).rejects.toThrow(BasketPromotionsWouldCombineError);
    await expect(refusal).rejects.toThrow("« Remise Cœur pros »");
  });

  it("laisse coexister une promotion de livraison et une de retrait, ou deux fenêtres disjointes", async () => {
    const s = writeScene(FROM);
    await s.pose.execute(new PosePromotionCommand(basketTerms(), STAFF, COEUR));
    await s.pose.execute(
      new PosePromotionCommand(
        basketTerms({ fulfillment: { kind: "delivery" } }),
        STAFF,
        PRICING_SURFACE,
      ),
    );
    await s.pose.execute(
      new PosePromotionCommand(
        basketTerms({
          fulfillment: { kind: "pickup" },
          validFrom: new Date(FROM.getTime() - 10 * DAY_MS),
          validTo: FROM,
        }),
        STAFF,
        PRICING_SURFACE,
      ),
    );
    expect(s.promotions.stored.size).toBe(3);
  });
});
