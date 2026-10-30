import { livePromotion } from "../../domain/__tests__/live-promotion.fixture.js";
import { LinePromotionSupply } from "../line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "../promotion-audience-facts.resolver.js";
import {
  FixedCompanyStatuses,
  FixedLinePromotions,
  FixedPrincipals,
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
  const principals = new FixedPrincipals(new Map([["co_site", "co_group"]]));
  const journal = new RecordingShadowJournal();
  const subject = new LinePromotionSupply(
    new FixedPromotionsSource(source),
    lines,
    new PromotionAudienceFactsResolver(statuses, principals),
    journal,
  );
  return { subject, lines, statuses, principals, journal };
}

describe("LinePromotionSupply", () => {
  it("sous `legacy`, ne lit aucune promotion et ne donne aucun journal", async () => {
    const { subject, lines } = supply("legacy", [livePromotion()]);

    const lot = await subject.forLot({ companyId: "co_1", buyerKind: "registered" }, AT, false);

    expect(lot).toEqual({ source: "legacy", promotions: [], journal: null });
    expect(lines.reads).toBe(0);
  });

  it("sous l'ombre, rend les promotions admises ET le journal", async () => {
    const { subject, journal } = supply("shadow", [livePromotion()]);

    const lot = await subject.forLot({ companyId: null, buyerKind: "guest" }, AT, false);

    expect(lot.promotions.map((promotion) => promotion.id)).toEqual(["promo_1"]);
    expect(lot.journal).toBe(journal);
  });

  it("ne lit pas le statut quand aucun public ne le demande", async () => {
    const { subject, statuses } = supply("promotions", [
      livePromotion({ audience: { kind: "company", companyId: "co_1" } }),
    ]);

    const lot = await subject.forLot({ companyId: "co_1", buyerKind: "registered" }, AT, false);

    expect(lot.promotions).toHaveLength(1);
    expect(statuses.asked).toEqual([]);
  });

  it("lit le statut pour un public « pros », et sert P0 : en attente = pro", async () => {
    const { subject, statuses } = supply("promotions", [
      livePromotion({ id: "pros", audience: { kind: "pros" } }),
      livePromotion({ id: "actifs", audience: { kind: "pros_active" } }),
    ]);

    const lot = await subject.forLot({ companyId: "co_1", buyerKind: "registered" }, AT, false);

    expect(lot.promotions.map((promotion) => promotion.id)).toEqual(["pros"]);
    expect(statuses.asked).toEqual(["co_1"]);
  });

  // Lot L10 : la porte d'entrée de la route atteint le point ligne.
  const BY_DOOR = [
    livePromotion({ id: "inscrits", audience: { kind: "individuals_registered" } }),
    livePromotion({ id: "invites", audience: { kind: "individuals_guest" } }),
  ];

  it("un inscrit reçoit la promotion « inscrits », un invité celle des invités", async () => {
    const { subject } = supply("promotions", BY_DOOR);

    const registered = await subject.forLot(
      { companyId: null, buyerKind: "registered" },
      AT,
      false,
    );
    const guest = await subject.forLot({ companyId: null, buyerKind: "guest" }, AT, false);

    expect(registered.promotions.map((promotion) => promotion.id)).toEqual(["inscrits"]);
    expect(guest.promotions.map((promotion) => promotion.id)).toEqual(["invites"]);
  });

  it("une porte inconnue (le staff) n'admet ni l'une ni l'autre", async () => {
    const { subject } = supply("promotions", BY_DOOR);

    const lot = await subject.forLot({ companyId: null, buyerKind: "unknown" }, AT, false);

    expect(lot.promotions).toEqual([]);
  });

  it("l'aperçu déclaré ne joue que « tout le monde », sans rien lire", async () => {
    const { subject, statuses } = supply("promotions", [
      livePromotion({ id: "tous" }),
      livePromotion({ id: "particuliers", audience: { kind: "individuals" } }),
      livePromotion({ id: "pros", audience: { kind: "pros" } }),
    ]);

    const lot = await subject.forLot({ companyId: null, buyerKind: "previewed" }, AT, false);

    expect(lot.promotions.map((promotion) => promotion.id)).toEqual(["tous"]);
    expect(statuses.asked).toEqual([]);
  });

  it("un site reçoit la promotion « société et ses sites » de son principal", async () => {
    const { subject, principals } = supply("promotions", [
      livePromotion({
        id: "groupe",
        audience: { kind: "company_and_sites", companyId: "co_group" },
      }),
      livePromotion({ id: "groupe_seul", audience: { kind: "company", companyId: "co_group" } }),
    ]);

    const lot = await subject.forLot({ companyId: "co_site", buyerKind: "registered" }, AT, false);

    expect(lot.promotions.map((promotion) => promotion.id)).toEqual(["groupe"]);
    expect(principals.asked).toEqual(["co_site"]);
  });

  it("ne lit pas le principal quand aucun public ne vise des sites", async () => {
    const { subject, principals } = supply("promotions", [livePromotion()]);

    await subject.forLot({ companyId: "co_site", buyerKind: "registered" }, AT, false);

    expect(principals.asked).toEqual([]);
  });
});
