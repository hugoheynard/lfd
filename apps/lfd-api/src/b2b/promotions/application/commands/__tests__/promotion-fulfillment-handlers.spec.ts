import { PromotionUnknownFulfillmentTargetError } from "../../../domain/errors/promotion-fulfillment-errors.js";
import { OverlappingPromotionError } from "../../../domain/errors/promotion-errors.js";
import type { PromotionFulfillment } from "../../../domain/promotion-fulfillment.js";
import { writeScene } from "../../__tests__/promotion-write.doubles.js";
import { FROM, basketTerms } from "../../../domain/__tests__/promotion-terms.fixture.js";
import { ArchivePromotionCommand } from "../archive-promotion.command.js";
import { PosePromotionCommand } from "../pose-promotion.command.js";
import { RevisePromotionCommand } from "../revise-promotion.command.js";

/**
 * Les gestes face aux points et aux zones qu'une promotion nomme (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 8.4, § 9) :
 * un point ou une zone inconnu est un refus nommé AVANT toute écriture, et
 * le journal les nomme par leur libellé.
 */

const STAFF = "staff_hugo";

const POINT_AND_ZONE: PromotionFulfillment = {
  kind: "basket",
  pickup: { points: ["pk_coeur"] },
  delivery: { zones: ["zone_vallee"] },
};

describe("poser une promotion « un point + une zone »", () => {
  it("écrit UNE promotion, et l'acte nomme le point et la zone par leur libellé", async () => {
    const { promotions, pose } = writeScene(FROM);

    const id = await pose.execute(
      new PosePromotionCommand(basketTerms({ fulfillment: POINT_AND_ZONE }), STAFF),
    );

    expect(promotions.stored.get(id)?.terms.fulfillment).toEqual(POINT_AND_ZONE);
    expect(promotions.acts[0]?.summary).toContain(
      "retrait au point Cœur de station et livraison en zone La vallée",
    );
  });

  it.each([
    [
      "une zone inconnue",
      { kind: "basket", pickup: "all", delivery: { zones: ["zone_fantome"] } },
      "Zone de livraison inconnue (zone_fantome)",
    ],
    [
      "un point inconnu",
      { kind: "basket", pickup: { points: ["pk_coeur", "pk_fantome"] }, delivery: "none" },
      "Point de retrait inconnu (pk_fantome)",
    ],
  ] as const)("refuse %s en la nommant, sans rien écrire", async (_case, fulfillment, message) => {
    const { promotions, pose } = writeScene(FROM);

    const refusal = pose.execute(new PosePromotionCommand(basketTerms({ fulfillment }), STAFF));

    await expect(refusal).rejects.toBeInstanceOf(PromotionUnknownFulfillmentTargetError);
    await expect(refusal).rejects.toThrow(message);
    expect(promotions.stored.size).toBe(0);
    expect(promotions.acts).toHaveLength(0);
  });

  it("refuse aussi à la révision une zone inconnue", async () => {
    const { promotions, pose, revise } = writeScene(FROM);
    const id = await pose.execute(new PosePromotionCommand(basketTerms(), STAFF));

    await expect(
      revise.execute(
        new RevisePromotionCommand(
          id,
          basketTerms({
            fulfillment: { kind: "basket", pickup: "none", delivery: { zones: ["zone_fantome"] } },
          }),
          STAFF,
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(PromotionUnknownFulfillmentTargetError);
    expect(promotions.acts).toHaveLength(1);
  });

  it("reposer les mêmes zones dans un autre ordre n'écrit rien (révision L9)", async () => {
    const { promotions, pose, revise } = writeScene(FROM);
    const zones = (ids: readonly string[]) =>
      basketTerms({ fulfillment: { kind: "basket", pickup: "none", delivery: { zones: ids } } });
    const id = await pose.execute(
      new PosePromotionCommand(zones(["zone_vallee", "zone_sommet"]), STAFF),
    );

    await revise.execute(
      new RevisePromotionCommand(id, zones(["zone_sommet", "zone_vallee"]), STAFF, null),
    );

    expect(promotions.acts.map((act) => act.kind)).toEqual(["posed"]);
  });

  it("archiver ne juge pas les cibles, et nomme celles qui existent encore", async () => {
    const { promotions, pose, archive } = writeScene(FROM);
    const id = await pose.execute(
      new PosePromotionCommand(basketTerms({ fulfillment: POINT_AND_ZONE }), STAFF),
    );

    await archive.execute(new ArchivePromotionCommand(id, STAFF, "fin de saison"));

    expect(promotions.acts[1]?.summary).toContain("livraison en zone La vallée");
  });

  // Les ensembles se croisent (même zone, même public, même article) : c'est
  // un chevauchement, jugé avant « une seule promotion de panier ».
  it("refuse une seconde promotion de panier non cumulable sur la même zone", async () => {
    const { pose } = writeScene(FROM);
    await pose.execute(
      new PosePromotionCommand(basketTerms({ fulfillment: POINT_AND_ZONE }), STAFF),
    );

    await expect(
      pose.execute(
        new PosePromotionCommand(
          basketTerms({
            internalName: "Livraison en vallée",
            fulfillment: { kind: "basket", pickup: "none", delivery: { zones: ["zone_vallee"] } },
          }),
          STAFF,
        ),
      ),
    ).rejects.toBeInstanceOf(OverlappingPromotionError);
  });

  it("accepte une seconde promotion de panier sur un autre point et une autre zone", async () => {
    const { promotions, pose } = writeScene(FROM);
    await pose.execute(
      new PosePromotionCommand(basketTerms({ fulfillment: POINT_AND_ZONE }), STAFF),
    );

    await pose.execute(
      new PosePromotionCommand(
        basketTerms({
          internalName: "Gare et sommet",
          fulfillment: {
            kind: "basket",
            pickup: { points: ["pk_gare"] },
            delivery: { zones: ["zone_sommet"] },
          },
        }),
        STAFF,
      ),
    );

    expect(promotions.stored.size).toBe(2);
  });
});
