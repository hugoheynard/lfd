import { livePromotion } from "../../domain/__tests__/live-promotion.fixture.js";
import { LinePromotionSupply } from "../line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "../promotion-audience-facts.resolver.js";
import {
  FixedCompanyStatuses,
  FixedLinePromotions,
  FixedPrincipals,
} from "./promotion-supply.doubles.js";
import type { LivePromotion } from "../../domain/live-promotion.js";
import { TypicalBuyer } from "../../domain/lot-buyer.js";

/**
 * Ce que le chargeur des prix reçoit des promotions (plan des promotions,
 * § 13.5, lot L5) : le statut d'une société lu seulement si une promotion le
 * demande. Les cas `legacy` et `shadow` sont retirés avec l'ancien chemin (L12).
 */

const AT = new Date("2026-11-15T10:00:00.000Z");

function supply(promotions: readonly LivePromotion[]) {
  const lines = new FixedLinePromotions(promotions);
  const statuses = new FixedCompanyStatuses(new Map([["co_1", "pending"]]));
  const principals = new FixedPrincipals(new Map([["co_site", "co_group"]]));
  const subject = new LinePromotionSupply(
    lines,
    new PromotionAudienceFactsResolver(statuses, principals),
  );
  return { subject, lines, statuses, principals };
}

describe("LinePromotionSupply", () => {
  it("ne lit pas le statut quand aucun public ne le demande", async () => {
    const { subject, statuses } = supply([
      livePromotion({ audience: { kind: "company", companyId: "co_1" } }),
    ]);

    const lot = await subject.forLot(
      { kind: "real", companyId: "co_1", buyerKind: "registered" },
      AT,
      false,
    );

    expect(lot).toHaveLength(1);
    expect(statuses.asked).toEqual([]);
  });

  it("lit le statut pour un public « pros », et sert P0 : en attente = pro", async () => {
    const { subject, statuses } = supply([
      livePromotion({ id: "pros", audience: { kind: "pros" } }),
      livePromotion({ id: "actifs", audience: { kind: "pros_active" } }),
    ]);

    const lot = await subject.forLot(
      { kind: "real", companyId: "co_1", buyerKind: "registered" },
      AT,
      false,
    );

    expect(lot.map((promotion) => promotion.id)).toEqual(["pros"]);
    expect(statuses.asked).toEqual(["co_1"]);
  });

  // Lot L10 : la porte d'entrée de la route atteint le point ligne.
  const BY_DOOR = [
    livePromotion({ id: "inscrits", audience: { kind: "individuals_registered" } }),
    livePromotion({ id: "invites", audience: { kind: "individuals_guest" } }),
  ];

  it("un inscrit reçoit la promotion « inscrits », un invité celle des invités", async () => {
    const { subject } = supply(BY_DOOR);

    const registered = await subject.forLot(
      { kind: "real", companyId: null, buyerKind: "registered" },
      AT,
      false,
    );
    const guest = await subject.forLot(
      { kind: "real", companyId: null, buyerKind: "guest" },
      AT,
      false,
    );

    expect(registered.map((promotion) => promotion.id)).toEqual(["inscrits"]);
    expect(guest.map((promotion) => promotion.id)).toEqual(["invites"]);
  });

  it("une porte inconnue (le staff) n'admet ni l'une ni l'autre", async () => {
    const { subject } = supply(BY_DOOR);

    const lot = await subject.forLot(
      { kind: "real", companyId: null, buyerKind: "unknown" },
      AT,
      false,
    );

    expect(lot).toEqual([]);
  });

  it("l'aperçu déclaré ne joue que « tout le monde », sans rien lire", async () => {
    const { subject, statuses } = supply([
      livePromotion({ id: "tous" }),
      livePromotion({ id: "particuliers", audience: { kind: "individuals" } }),
      livePromotion({ id: "pros", audience: { kind: "pros" } }),
    ]);

    const lot = await subject.forLot(
      { kind: "real", companyId: null, buyerKind: "previewed" },
      AT,
      false,
    );

    expect(lot.map((promotion) => promotion.id)).toEqual(["tous"]);
    expect(statuses.asked).toEqual([]);
  });

  it("un site reçoit la promotion « société et ses sites » de son principal", async () => {
    const { subject, principals } = supply([
      livePromotion({
        id: "groupe",
        audience: { kind: "company_and_sites", companyId: "co_group" },
      }),
      livePromotion({ id: "groupe_seul", audience: { kind: "company", companyId: "co_group" } }),
    ]);

    const lot = await subject.forLot(
      { kind: "real", companyId: "co_site", buyerKind: "registered" },
      AT,
      false,
    );

    expect(lot.map((promotion) => promotion.id)).toEqual(["groupe"]);
    expect(principals.asked).toEqual(["co_site"]);
  });

  it("ne lit pas le principal quand aucun public ne vise des sites", async () => {
    const { subject, principals } = supply([livePromotion()]);

    await subject.forLot(
      { kind: "real", companyId: "co_site", buyerKind: "registered" },
      AT,
      false,
    );

    expect(principals.asked).toEqual([]);
  });

  // Le pro type de la grille de prix (`plan-export-grille-de-prix.md`, § 8) :
  // ses faits sont construits en amont, aucune société n'est lue.
  const BY_CLIENTELE = [
    livePromotion({ id: "tous" }),
    livePromotion({ id: "pros", audience: { kind: "pros" } }),
    livePromotion({ id: "actifs", audience: { kind: "pros_active" } }),
    livePromotion({ id: "en_attente", audience: { kind: "pros_pending" } }),
    livePromotion({ id: "particuliers", audience: { kind: "individuals" } }),
    livePromotion({ id: "une_societe", audience: { kind: "company", companyId: "co_1" } }),
    livePromotion({
      id: "groupe",
      audience: { kind: "company_and_sites", companyId: "co_group" },
    }),
  ];

  it("un pro type actif reçoit « pros actifs », jamais « particuliers » ni une société", async () => {
    const { subject, statuses, principals } = supply(BY_CLIENTELE);

    const lot = await subject.forLot(TypicalBuyer.of("pro_active"), AT, false);

    expect(lot.map((promotion) => promotion.id).sort()).toEqual(["actifs", "pros", "tous"]);
    expect(statuses.asked).toEqual([]);
    expect(principals.asked).toEqual([]);
  });

  it("un pro type en cours d'inscription reçoit « pros en attente », pas « pros actifs »", async () => {
    const { subject, statuses } = supply(BY_CLIENTELE);

    const lot = await subject.forLot(TypicalBuyer.of("pro_pending"), AT, false);

    expect(lot.map((promotion) => promotion.id).sort()).toEqual(["en_attente", "pros", "tous"]);
    expect(statuses.asked).toEqual([]);
  });
});
