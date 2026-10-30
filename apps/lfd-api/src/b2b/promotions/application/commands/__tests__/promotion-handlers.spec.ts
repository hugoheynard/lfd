import {
  ArchivedPromotionIsSealedError,
  OverlappingPromotionError,
  PromotionAlreadyPausedError,
  PromotionArchiveReasonMissingError,
  PromotionNotFoundError,
  PromotionNotPausedError,
  PromotionReversedWindowError,
  PromotionScopeIncludesNothingError,
  PromotionWrongSurfaceError,
} from "../../../domain/errors/promotion-errors.js";
import { PRICING_SURFACE, type PromotionSurface } from "../../../domain/promotion-surface.js";
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

describe("les refus des gestes — l'erreur nommée, aucune écriture, aucun acte", () => {
  /** Une promotion posée, puis l'état et les actes à comparer après le refus. */
  async function posed(terms = lineTerms()) {
    const s = scene();
    const id = await s.pose.execute(new PosePromotionCommand(terms, STAFF, PRICING_SURFACE));
    return { s, id, before: s.promotions.stored.get(id), actsBefore: [...s.promotions.acts] };
  }

  it("une seconde pose du même public sur les mêmes articles est refusée et ne laisse rien", async () => {
    const { s, actsBefore } = await posed();
    await expect(
      s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE)),
    ).rejects.toBeInstanceOf(OverlappingPromotionError);
    expect([...s.promotions.stored.keys()]).toEqual(["promo_000001"]);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it("une révision qui chevauche une autre laisse l'état d'avant et n'écrit pas d'acte", async () => {
    const { s, id, before, actsBefore } = await posed(
      lineTerms({ validFrom: FROM, validTo: UNTIL }),
    );
    const other = await s.pose.execute(
      new PosePromotionCommand(
        lineTerms({ validFrom: UNTIL, validTo: null }),
        STAFF,
        PRICING_SURFACE,
      ),
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
          PRICING_SURFACE,
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
          PRICING_SURFACE,
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
        new PosePromotionCommand(
          lineTerms({ validFrom: UNTIL, validTo: FROM }),
          STAFF,
          PRICING_SURFACE,
        ),
      ),
    ).rejects.toBeInstanceOf(PromotionReversedWindowError);
    expect(s.promotions.stored.size).toBe(0);
    expect(s.catalogue.reads).toBe(0);
  });

  it("une archivée est scellée : réviser, suspendre, reprendre et ré-archiver sont refusés", async () => {
    const { s, id } = await posed();
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin", PRICING_SURFACE));
    const sealed = s.promotions.stored.get(id);
    const acts = [...s.promotions.acts];
    const gestures = [
      () =>
        s.revise.execute(new RevisePromotionCommand(id, lineTerms(), STAFF, "x", PRICING_SURFACE)),
      () => s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE)),
      () => s.resume.execute(new ResumePromotionCommand(id, STAFF, null, PRICING_SURFACE)),
      () => s.archive.execute(new ArchivePromotionCommand(id, STAFF, "encore", PRICING_SURFACE)),
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
      s.resume.execute(new ResumePromotionCommand(id, STAFF, null, PRICING_SURFACE)),
    ).rejects.toBeInstanceOf(PromotionNotPausedError);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it.each([[""], ["   "]])(
    "archiver avec le motif %j est refusé : la promotion reste active",
    async (reason) => {
      const { s, id, before, actsBefore } = await posed();
      await expect(
        s.archive.execute(new ArchivePromotionCommand(id, STAFF, reason, PRICING_SURFACE)),
      ).rejects.toBeInstanceOf(PromotionArchiveReasonMissingError);
      expect(s.promotions.stored.get(id)).toBe(before);
      expect(s.promotions.acts).toEqual(actsBefore);
    },
  );

  it("l'archivage libère la place : la même promotion peut être reposée", async () => {
    const { s, id } = await posed();
    await s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin", PRICING_SURFACE));
    await expect(
      s.pose.execute(new PosePromotionCommand(lineTerms(), STAFF, PRICING_SURFACE)),
    ).resolves.toBe("promo_000002");
  });

  it("chaque geste d'un point refuse la promotion d'un AUTRE point, sans rien écrire", async () => {
    const s = scene();
    const id = await s.pose.execute(new PosePromotionCommand(basketTerms(), STAFF, PICKUP_COEUR));
    // Régression : « reprendre » jugeait l'état avant la surface, et rendait
    // « pas suspendue » à un autre point. La promotion reste ici ACTIVE.
    const elsewhere: PromotionSurface = { kind: "pickup_point", pickupId: "pk_autre" };
    const before = s.promotions.stored.get(id);
    const acts = [...s.promotions.acts];
    const gestures = [
      () => s.revise.execute(new RevisePromotionCommand(id, basketTerms(), STAFF, "x", elsewhere)),
      () => s.pause.execute(new PausePromotionCommand(id, STAFF, null, elsewhere)),
      () => s.resume.execute(new ResumePromotionCommand(id, STAFF, null, elsewhere)),
      () => s.archive.execute(new ArchivePromotionCommand(id, STAFF, "fin", elsewhere)),
    ];
    for (const gesture of gestures) {
      await expect(gesture()).rejects.toBeInstanceOf(PromotionWrongSurfaceError);
    }
    expect(s.promotions.stored.get(id)).toBe(before);
    expect(s.promotions.acts).toEqual(acts);
  });

  it("la surface est jugée AVANT les rivales : aucune lecture du catalogue", async () => {
    const { s } = await posed();
    const reads = s.catalogue.reads;
    await expect(
      s.pose.execute(new PosePromotionCommand(basketTerms(), STAFF, PRICING_SURFACE)),
    ).rejects.toBeInstanceOf(PromotionWrongSurfaceError);
    expect(s.catalogue.reads).toBe(reads);
  });

  it("une révision garde l'identité d'origine : auteur et date de création ne bougent pas", async () => {
    const { s, id } = await posed();
    await s.revise.execute(
      new RevisePromotionCommand(
        id,
        lineTerms({ internalName: "Autre" }),
        "staff_autre",
        "x",
        PRICING_SURFACE,
      ),
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
    await s.revise.execute(new RevisePromotionCommand(id, same, STAFF, "x", PRICING_SURFACE));
    expect(s.promotions.stored.get(id)).toBe(before);
    expect(s.promotions.acts).toEqual(actsBefore);
  });

  it("une révision identique depuis un autre point reste refusée", async () => {
    const { s, id, before } = await posed();
    const same = before?.terms ?? lineTerms();
    const elsewhere: PromotionSurface = { kind: "pickup_point", pickupId: "pk_autre" };
    await expect(
      s.revise.execute(new RevisePromotionCommand(id, same, STAFF, "x", elsewhere)),
    ).rejects.toBeInstanceOf(PromotionWrongSurfaceError);
  });

  it("une promotion suspendue se révise et reste suspendue", async () => {
    const { s, id } = await posed();
    await s.pause.execute(new PausePromotionCommand(id, STAFF, null, PRICING_SURFACE));
    await s.revise.execute(
      new RevisePromotionCommand(
        id,
        lineTerms({ internalName: "Autre" }),
        STAFF,
        "x",
        PRICING_SURFACE,
      ),
    );
    expect(s.promotions.stored.get(id)?.status).toBe("paused");
  });
});
