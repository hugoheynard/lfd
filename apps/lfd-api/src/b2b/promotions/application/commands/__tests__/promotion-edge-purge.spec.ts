import {
  ArchivedPromotionIsSealedError,
  PromotionAlreadyPausedError,
  PromotionNotPausedError,
  PromotionScopeIncludesNothingError,
} from "../../../domain/errors/promotion-errors.js";
import { FROM, basketTerms, lineTerms } from "../../../domain/__tests__/promotion-terms.fixture.js";
import { writeScene } from "../../__tests__/promotion-write.doubles.js";
import { ArchivePromotionCommand } from "../archive-promotion.command.js";
import { PausePromotionCommand } from "../pause-promotion.command.js";
import { PosePromotionCommand } from "../pose-promotion.command.js";
import { ResumePromotionCommand } from "../resume-promotion.command.js";
import { RevisePromotionCommand } from "../revise-promotion.command.js";

const STAFF = "staff_hugo";

/** Une promotion posée, la purge de sa pose déjà comptée puis remise à zéro. */
async function posed() {
  const s = writeScene(FROM);
  const id = await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF));
  await s.afterCommit.commit();
  s.edge.purges = 0;
  return { ...s, id };
}

/**
 * La remise annoncée sur un point de retrait vient des promotions
 * (`announced-pickup-address.repository.ts`), et `GET /pickup-addresses` est
 * gardée par Workers Cache depuis le 2026-11-05 : chacun des cinq gestes purge,
 * après la validation, et un geste refusé ne purge rien.
 */
describe("promotions — la purge de la liste publique des points", () => {
  it("la pose purge après la validation, et pas avant", async () => {
    const s = writeScene(FROM);
    await s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF));
    expect(s.edge.purges).toBe(0);
    await s.afterCommit.commit();
    expect(s.edge.purges).toBe(1);
  });

  it("réviser, suspendre, reprendre et archiver purgent chacun une fois", async () => {
    const s = await posed();
    await s.revise.execute(new RevisePromotionCommand(s.id, basketTerms(), STAFF, "au retrait"));
    await s.pause.execute(new PausePromotionCommand(s.id, STAFF, null));
    await s.resume.execute(new ResumePromotionCommand(s.id, STAFF, null));
    await s.archive.execute(new ArchivePromotionCommand(s.id, STAFF, "fin de saison"));
    expect(s.edge.purges).toBe(0);
    await s.afterCommit.commit();
    expect(s.edge.purges).toBe(4);
  });

  it("une révision à l'identique n'écrit rien, et ne purge rien", async () => {
    const s = await posed();
    await s.revise.execute(new RevisePromotionCommand(s.id, lineTerms(), STAFF, null));
    await s.afterCommit.commit();
    expect(s.edge.purges).toBe(0);
  });

  it("un geste refusé ne purge rien", async () => {
    const s = await posed();
    const invalid = lineTerms({ scope: { mode: "only", rules: [] } });
    await expect(s.pose.execute(new PosePromotionCommand(invalid, STAFF))).rejects.toBeInstanceOf(
      PromotionScopeIncludesNothingError,
    );
    await expect(
      s.resume.execute(new ResumePromotionCommand(s.id, STAFF, null)),
    ).rejects.toBeInstanceOf(PromotionNotPausedError);
    await s.afterCommit.commit();
    expect(s.edge.purges).toBe(0);
    await s.pause.execute(new PausePromotionCommand(s.id, STAFF, null));
    await s.afterCommit.commit();
    s.edge.purges = 0;
    await expect(
      s.pause.execute(new PausePromotionCommand(s.id, STAFF, null)),
    ).rejects.toBeInstanceOf(PromotionAlreadyPausedError);
    await s.archive.execute(new ArchivePromotionCommand(s.id, STAFF, "fin"));
    await s.afterCommit.commit();
    s.edge.purges = 0;
    await expect(
      s.archive.execute(new ArchivePromotionCommand(s.id, STAFF, "encore")),
    ).rejects.toBeInstanceOf(ArchivedPromotionIsSealedError);
    await s.afterCommit.commit();
    expect(s.edge.purges).toBe(0);
  });
});
