import {
  PromotionAlreadyPausedError,
  PromotionNotFoundError,
  PromotionScopeIncludesNothingError,
} from "../../../domain/errors/promotion-errors.js";
import { PRICING_SURFACE, type PromotionSurface } from "../../../domain/promotion-surface.js";
import { writeScene } from "../../__tests__/promotion-write.doubles.js";
import { FROM, basketTerms, lineTerms } from "../../../domain/__tests__/promotion-terms.fixture.js";
import { ArchivePromotionCommand } from "../archive-promotion.command.js";
import { PausePromotionCommand } from "../pause-promotion.command.js";
import { PosePromotionCommand } from "../pose-promotion.command.js";
import { ResumePromotionCommand } from "../resume-promotion.command.js";
import { RevisePromotionCommand } from "../revise-promotion.command.js";

const STAFF = "staff_hugo";

const PICKUP_COEUR: PromotionSurface = { kind: "pickup_point", pickupId: "pk_coeur" };

function scene() {
  return writeScene(FROM);
}

describe("les gestes sur une promotion", () => {
  it("la pose écrit l'agrégat et son acte, et rend l'identifiant", async () => {
    const { promotions, pose } = scene();
    const id = await pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE));
    expect(id).toBe("promo_000001");
    expect(promotions.stored.get(id)?.status).toBe("active");
    expect(promotions.acts).toEqual([
      expect.objectContaining({ subjectId: id, kind: "posed", actor: STAFF, at: FROM }),
    ]);
  });

  it("une pose refusée par l'agrégat n'écrit rien", async () => {
    const { promotions, pose } = scene();
    const invalid = lineTerms({ scope: { mode: "only", rules: [] } });
    await expect(
      pose.execute(new PosePromotionCommand(invalid, STAFF, PRICING_SURFACE)),
    ).rejects.toThrow(PromotionScopeIncludesNothingError);
    expect(promotions.stored.size).toBe(0);
    expect(promotions.acts).toEqual([]);
  });

  it("révise, suspend, reprend puis archive — un acte par geste, dans l'ordre", async () => {
    const s = scene();
    const id = await s.pose.execute(
      new PosePromotionCommand(basketTerms({ internalName: "Avant" }), STAFF, PICKUP_COEUR),
    );
    await s.revise.execute(
      new RevisePromotionCommand(id, basketTerms(), STAFF, "passe au retrait", PICKUP_COEUR),
    );
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null, PICKUP_COEUR));
    await s.resume.execute(new ResumePromotionCommand(id, STAFF, null, PICKUP_COEUR));
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin de saison", PICKUP_COEUR));
    expect(s.promotions.acts.map((act) => act.kind)).toEqual([
      "posed",
      "replaced",
      "paused",
      "resumed",
      "archived",
    ]);
    expect(s.promotions.acts[1]?.summary).toContain("retrait au point pk_coeur");
    expect(s.promotions.stored.get(id)?.status).toBe("archived");
  });

  it("un geste refusé n'écrit ni état ni acte", async () => {
    const s = scene();
    const id = await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE));
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE));
    await expect(
      s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE)),
    ).rejects.toThrow(PromotionAlreadyPausedError);
    expect(s.promotions.acts.map((act) => act.kind)).toEqual(["posed", "paused"]);
  });

  it("refuse de toucher une promotion qui n'existe pas", async () => {
    const { pause } = scene();
    await expect(
      pause.execute(new PausePromotionCommand("absente", STAFF, null, PRICING_SURFACE)),
    ).rejects.toThrow(PromotionNotFoundError);
  });
});
