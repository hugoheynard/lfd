import { livePromotion } from "../../domain/__tests__/live-promotion.fixture.js";
import { LinePromotionSupply } from "../line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "../promotion-audience-facts.resolver.js";
import {
  FixedCompanyStatuses,
  FixedLinePromotions,
  FixedPromotionsSource,
  RecordingShadowJournal,
} from "./promotion-supply.doubles.js";
import type { PromotionsSource } from "../../domain/promotions-source.js";
import type { LivePromotion } from "../../domain/live-promotion.js";

/**
 * Ce que le chargeur des prix reçoit des promotions (plan des promotions,
 * § 13.5, lot L5) : rien à lire sous `legacy`, et le statut d'une société lu
 * seulement si une promotion le demande.
 */

const AT = new Date("2026-11-15T10:00:00.000Z");

function supply(source: PromotionsSource, promotions: readonly LivePromotion[]) {
  const lines = new FixedLinePromotions(promotions);
  const statuses = new FixedCompanyStatuses(new Map([["co_1", "pending"]]));
  const journal = new RecordingShadowJournal();
  const subject = new LinePromotionSupply(
    new FixedPromotionsSource(source),
    lines,
    new PromotionAudienceFactsResolver(statuses),
    journal,
  );
  return { subject, lines, statuses, journal };
}

describe("LinePromotionSupply", () => {
  it("sous `legacy`, ne lit aucune promotion et ne donne aucun journal", async () => {
    const { subject, lines } = supply("legacy", [livePromotion()]);

    const lot = await subject.forLot("co_1", AT, false);

    expect(lot).toEqual({ source: "legacy", promotions: [], journal: null });
    expect(lines.reads).toBe(0);
  });

  it("sous l'ombre, rend les promotions admises ET le journal", async () => {
    const { subject, journal } = supply("shadow", [livePromotion()]);

    const lot = await subject.forLot(null, AT, false);

    expect(lot.promotions.map((promotion) => promotion.id)).toEqual(["promo_1"]);
    expect(lot.journal).toBe(journal);
  });

  it("ne lit pas le statut quand aucun public ne le demande", async () => {
    const { subject, statuses } = supply("promotions", [
      livePromotion({ audience: { kind: "company", companyId: "co_1" } }),
    ]);

    const lot = await subject.forLot("co_1", AT, false);

    expect(lot.promotions).toHaveLength(1);
    expect(statuses.asked).toEqual([]);
  });

  it("lit le statut pour un public « pros », et sert P0 : en attente = pro", async () => {
    const { subject, statuses } = supply("promotions", [
      livePromotion({ id: "pros", audience: { kind: "pros" } }),
      livePromotion({ id: "actifs", audience: { kind: "pros_active" } }),
    ]);

    const lot = await subject.forLot("co_1", AT, false);

    expect(lot.promotions.map((promotion) => promotion.id)).toEqual(["pros"]);
    expect(statuses.asked).toEqual(["co_1"]);
  });
});
