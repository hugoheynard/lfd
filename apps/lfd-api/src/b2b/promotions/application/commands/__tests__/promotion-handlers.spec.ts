import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  PromotionAlreadyPausedError,
  PromotionNotFoundError,
  PromotionScopeIncludesNothingError,
} from "../../../domain/errors/promotion-errors.js";
import { PromotionRepository } from "../../../domain/ports/promotion.repository.js";
import type { PromotionAct } from "../../../domain/promotion-act.js";
import type { Promotion } from "../../../domain/promotion.js";
import { FROM, basketTerms, lineTerms } from "../../../domain/__tests__/promotion-terms.fixture.js";
import { ArchivePromotionCommand } from "../archive-promotion.command.js";
import { ArchivePromotionHandler } from "../archive-promotion.handler.js";
import { PausePromotionCommand } from "../pause-promotion.command.js";
import { PausePromotionHandler } from "../pause-promotion.handler.js";
import { PosePromotionCommand } from "../pose-promotion.command.js";
import { PosePromotionHandler } from "../pose-promotion.handler.js";
import { ResumePromotionCommand } from "../resume-promotion.command.js";
import { ResumePromotionHandler } from "../resume-promotion.handler.js";
import { RevisePromotionCommand } from "../revise-promotion.command.js";
import { RevisePromotionHandler } from "../revise-promotion.handler.js";

/** Le dépôt en mémoire : l'état et ses actes, écrits ensemble comme en base. */
class InMemoryPromotions extends PromotionRepository {
  readonly stored = new Map<string, Promotion>();
  readonly acts: PromotionAct[] = [];

  load(id: string): Promise<Promotion | null> {
    return Promise.resolve(this.stored.get(id) ?? null);
  }

  save(promotion: Promotion, act: PromotionAct): Promise<void> {
    this.stored.set(promotion.id, promotion);
    this.acts.push(act);
    return Promise.resolve();
  }
}

const STAFF = "staff_hugo";

function scene() {
  const promotions = new InMemoryPromotions();
  const clock = new FixedClock(FROM);
  return {
    promotions,
    pose: new PosePromotionHandler(promotions, new FixedIdGenerator("promo"), clock),
    revise: new RevisePromotionHandler(promotions, clock),
    pause: new PausePromotionHandler(promotions, clock),
    resume: new ResumePromotionHandler(promotions, clock),
    archive: new ArchivePromotionHandler(promotions, clock),
  };
}

describe("les gestes sur une promotion", () => {
  it("la pose écrit l'agrégat et son acte, et rend l'identifiant", async () => {
    const { promotions, pose } = scene();
    const id = await pose.execute(new PosePromotionCommand(lineTerms(), STAFF));
    expect(id).toBe("promo_000001");
    expect(promotions.stored.get(id)?.status).toBe("active");
    expect(promotions.acts).toEqual([
      expect.objectContaining({ subjectId: id, kind: "posed", actor: STAFF, at: FROM }),
    ]);
  });

  it("une pose refusée par l'agrégat n'écrit rien", async () => {
    const { promotions, pose } = scene();
    const invalid = lineTerms({ scope: { mode: "only", rules: [] } });
    await expect(pose.execute(new PosePromotionCommand(invalid, STAFF))).rejects.toThrow(
      PromotionScopeIncludesNothingError,
    );
    expect(promotions.stored.size).toBe(0);
    expect(promotions.acts).toEqual([]);
  });

  it("révise, suspend, reprend puis archive — un acte par geste, dans l'ordre", async () => {
    const s = scene();
    const id = await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF));
    await s.revise.execute(
      new RevisePromotionCommand(id, basketTerms(), STAFF, "passe au retrait"),
    );
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null));
    await s.resume.execute(new ResumePromotionCommand(id, STAFF, null));
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin de saison"));
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
    const id = await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF));
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null));
    await expect(s.pause.execute(new PausePromotionCommand(id, STAFF, null))).rejects.toThrow(
      PromotionAlreadyPausedError,
    );
    expect(s.promotions.acts.map((act) => act.kind)).toEqual(["posed", "paused"]);
  });

  it("refuse de toucher une promotion qui n'existe pas", async () => {
    const { pause } = scene();
    await expect(pause.execute(new PausePromotionCommand("absente", STAFF, null))).rejects.toThrow(
      PromotionNotFoundError,
    );
  });
});
