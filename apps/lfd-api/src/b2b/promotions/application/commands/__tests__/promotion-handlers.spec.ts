import {
  ArchivedPromotionIsSealedError,
  OverlappingPromotionError,
  PromotionAlreadyPausedError,
  PromotionArchiveReasonMissingError,
  PromotionNotFoundError,
  PromotionNotPausedError,
  PromotionReversedWindowError,
  PromotionScopeIncludesNothingError,
} from "../../../domain/errors/promotion-errors.js";
import { writeScene } from "../../__tests__/promotion-write.doubles.js";
import {
  FROM,
  UNTIL,
  basketTerms,
  lineTerms,
} from "../../../domain/__tests__/promotion-terms.fixture.js";
import { ArchivePromotionCommand } from "../archive-promotion.command.js";
import { PausePromotionCommand } from "../pause-promotion.command.js";
import { PosePromotionCommand } from "../pose-promotion.command.js";
import { ResumePromotionCommand } from "../resume-promotion.command.js";
import { RevisePromotionCommand } from "../revise-promotion.command.js";

const STAFF = "staff_hugo";

function scene() {
  return writeScene(FROM);
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
    const id = await s.pose.execute(
      new PosePromotionCommand(basketTerms({ internalName: "Avant" }), STAFF),
    );
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

describe("les refus des gestes — l'erreur nommée, aucune écriture, aucun acte", () => {
  /** Une promotion posée, puis l'état et les actes à comparer après le refus. */
  async function posed(terms = lineTerms()) {
    const s = scene();
    const id = await s.pose.execute(new PosePromotionCommand(terms, STAFF));
    return { s, id, before: s.promotions.stored.get(id), actsBefore: [...s.promotions.acts] };
  }

  it("une seconde pose du même public sur les mêmes articles est refusée et ne laisse rien", async () => {
    const { s, actsBefore } = await posed();
    await expect(
      s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF)),
    ).rejects.toBeInstanceOf(OverlappingPromotionError);
    expect([...s.promotions.stored.keys()]).toEqual(["promo_000001"]);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it("une révision qui chevauche une autre laisse l'état d'avant et n'écrit pas d'acte", async () => {
    const { s, id, before, actsBefore } = await posed(
      lineTerms({ validFrom: FROM, validTo: UNTIL }),
    );
    const other = await s.pose.execute(
      new PosePromotionCommand(lineTerms({ validFrom: UNTIL, validTo: null }), STAFF),
    );
    const otherBefore = s.promotions.stored.get(other);
    const actsAfterPose = [...s.promotions.acts];
    // Les fenêtres se suivent (fin exclue) ; la seconde, rouverte d'un jour plus tôt, mord.
    const earlier = new Date(UNTIL.getTime() - 24 * 60 * 60 * 1000);
    await expect(
      s.revise.execute(
        new RevisePromotionCommand(
          other,
          lineTerms({ validFrom: earlier, validTo: null }),
          STAFF,
          "plus tôt",
        ),
      ),
    ).rejects.toBeInstanceOf(OverlappingPromotionError);
    expect(s.promotions.stored.get(other)).toBe(otherBefore);
    expect(s.promotions.stored.get(id)).toBe(before);
    expect(s.promotions.acts).toEqual(actsAfterPose);
    expect(actsBefore).toHaveLength(1);
  });

  it("une révision à fenêtre inversée est refusée sans toucher à l'existante", async () => {
    const { s, id, before, actsBefore } = await posed();
    await expect(
      s.revise.execute(
        new RevisePromotionCommand(
          id,
          lineTerms({ validFrom: UNTIL, validTo: FROM }),
          STAFF,
          "oups",
        ),
      ),
    ).rejects.toBeInstanceOf(PromotionReversedWindowError);
    expect(s.promotions.stored.get(id)).toBe(before);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it("une pose à fenêtre inversée n'avance pas le compteur d'identifiants lu en base", async () => {
    const s = scene();
    await expect(
      s.pose.execute(
        new PosePromotionCommand(lineTerms({ validFrom: UNTIL, validTo: FROM }), STAFF),
      ),
    ).rejects.toBeInstanceOf(PromotionReversedWindowError);
    expect(s.promotions.stored.size).toBe(0);
    expect(s.catalogue.reads).toBe(0);
  });

  it("une archivée est scellée : réviser, suspendre, reprendre et ré-archiver sont refusés", async () => {
    const { s, id } = await posed();
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin"));
    const sealed = s.promotions.stored.get(id);
    const acts = [...s.promotions.acts];
    const gestures = [
      () => s.revise.execute(new RevisePromotionCommand(id, lineTerms(), STAFF, "x")),
      () => s.pause.execute(new PausePromotionCommand(id, STAFF, null)),
      () => s.resume.execute(new ResumePromotionCommand(id, STAFF, null)),
      () => s.archive.execute(new ArchivePromotionCommand(id, STAFF, "encore")),
    ];
    for (const gesture of gestures) {
      await expect(gesture()).rejects.toBeInstanceOf(ArchivedPromotionIsSealedError);
    }
    expect(s.promotions.stored.get(id)).toBe(sealed);
    expect(s.promotions.acts).toEqual(acts);
  });

  it("reprendre une promotion qui n'est pas suspendue est refusé", async () => {
    const { s, id, actsBefore } = await posed();
    await expect(
      s.resume.execute(new ResumePromotionCommand(id, STAFF, null)),
    ).rejects.toBeInstanceOf(PromotionNotPausedError);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it.each([[""], ["   "]])(
    "archiver avec le motif %j est refusé : la promotion reste active",
    async (reason) => {
      const { s, id, before, actsBefore } = await posed();
      await expect(
        s.archive.execute(new ArchivePromotionCommand(id, STAFF, reason)),
      ).rejects.toBeInstanceOf(PromotionArchiveReasonMissingError);
      expect(s.promotions.stored.get(id)).toBe(before);
      expect(s.promotions.acts).toEqual(actsBefore);
    },
  );

  it("l'archivage libère la place : la même promotion peut être reposée", async () => {
    const { s, id } = await posed();
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin"));
    await expect(s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF))).resolves.toBe(
      "promo_000002",
    );
  });

  it("une révision garde l'identité d'origine : auteur et date de création ne bougent pas", async () => {
    const { s, id } = await posed();
    await s.revise.execute(
      new RevisePromotionCommand(id, lineTerms({ internalName: "Autre" }), "staff_autre", "x"),
    );
    const state = s.promotions.stored.get(id)?.toPersistence();
    expect(state).toMatchObject({ id, createdBy: STAFF, createdAt: FROM, internalName: "Autre" });
  });

  /**
   * Régression : une révision identique écrivait quand même un acte
   * `replaced` au journal (corrigé le 2026-10-30).
   */
  it("une révision identique à la promotion relue n'écrit ni état ni acte", async () => {
    const { s, id, before, actsBefore } = await posed();
    const same = before?.terms ?? lineTerms();
    await s.revise.execute(new RevisePromotionCommand(id, same, STAFF, "x"));
    expect(s.promotions.stored.get(id)).toBe(before);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it("une promotion suspendue se révise et reste suspendue", async () => {
    const { s, id } = await posed();
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null));
    await s.revise.execute(
      new RevisePromotionCommand(id, lineTerms({ internalName: "Autre" }), STAFF, "x"),
    );
    expect(s.promotions.stored.get(id)?.status).toBe("paused");
  });
});
