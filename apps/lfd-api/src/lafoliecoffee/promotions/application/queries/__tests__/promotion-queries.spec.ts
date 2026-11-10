import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PromotionNotFoundError } from "../../../domain/errors/promotion-errors.js";
import { PromotionBrowser } from "../../../domain/ports/promotion-browser.reader.js";
import { Promotion } from "../../../domain/promotion.js";
import { audienceCompanyIdOf } from "../../../domain/promotion-audience.js";
import { PromotionAudienceSet } from "../../../domain/promotion-audience-set.js";
import type { PromotionTerms } from "../../../domain/promotion-terms.js";
import {
  FROM,
  UNTIL,
  basketTerms,
  lineTerms,
} from "../../../domain/__tests__/promotion-terms.fixture.js";
import { FixedPromotionCatalogue } from "../../__tests__/promotion-write.doubles.js";
import { FixedPromotionsSource } from "../../__tests__/promotion-supply.doubles.js";
import { GetPromotionHandler } from "../get-promotion.handler.js";
import { GetPromotionQuery } from "../get-promotion.query.js";
import { ListPromotionsHandler } from "../list-promotions.handler.js";
import { ListPromotionsQuery } from "../list-promotions.query.js";

class FixedBrowser extends PromotionBrowser {
  constructor(private readonly promotions: readonly Promotion[]) {
    super();
  }

  all(): Promise<readonly Promotion[]> {
    return Promise.resolve(this.promotions);
  }

  naming(companyId: string): Promise<readonly Promotion[]> {
    return Promise.resolve(
      this.promotions.filter((promotion) =>
        promotion.terms.audiences.companies.some(
          (target) => audienceCompanyIdOf(target) === companyId,
        ),
      ),
    );
  }

  find(id: string): Promise<Promotion | null> {
    return Promise.resolve(this.promotions.find((promotion) => promotion.id === id) ?? null);
  }
}

const STAFF = "staff_hugo";
const HOUR_MS = 3_600_000;
/** L'instant de la question : entre FROM et UNTIL. */
const ASKED = new Date(FROM.getTime() + 24 * HOUR_MS);

function posed(id: string, terms: PromotionTerms = lineTerms()): Promotion {
  return Promotion.pose(id, terms, STAFF, FROM);
}

const ACTIVE = posed("p_active");
const SCHEDULED = posed("p_scheduled", lineTerms({ validFrom: UNTIL }));
const ENDED = posed(
  "p_ended",
  lineTerms({ validFrom: new Date(FROM.getTime() - 48 * HOUR_MS), validTo: FROM }),
);
const PAUSED = posed("p_paused").pause(STAFF, FROM);
const ARCHIVED = posed("p_archived").archive(STAFF, FROM, "fin de saison");
const AT_COEUR = posed(
  "p_coeur",
  basketTerms({
    scope: {
      mode: "all_except",
      rules: [
        { target: "product", targetId: "p_croissant", eligible: false, targetRank: null },
        { target: "category", targetId: "c_pains", eligible: false, targetRank: null },
        { target: "variant", targetId: "INCONNU-1", eligible: false, targetRank: null },
      ],
    },
  }),
);
const FOR_CO_1 = posed(
  "p_co_1",
  lineTerms({
    audiences: PromotionAudienceSet.of([
      { kind: "individuals_registered" },
      { kind: "company", companyId: "co_1" },
    ]),
  }),
);
const ALL = [ACTIVE, SCHEDULED, ENDED, PAUSED, ARCHIVED, AT_COEUR, FOR_CO_1];

function list() {
  return new ListPromotionsHandler(
    new FixedBrowser(ALL),
    new FixedPromotionCatalogue(),
    new FixedPromotionsSource(),
    new FixedClock(ASKED),
  );
}

describe("ListPromotionsHandler", () => {
  it("lit l'état à l'instant de la question", async () => {
    const view = await list().execute(new ListPromotionsQuery(null));
    expect(Object.fromEntries(view.promotions.map((p) => [p.id, p.state]))).toEqual({
      p_active: "active",
      p_scheduled: "scheduled",
      p_ended: "ended",
      p_paused: "paused",
      p_archived: "archived",
      p_coeur: "active",
      p_co_1: "active",
    });
  });

  // L12 : le cas « en lecture seule avant la bascule » est retiré avec l'ancien chemin.
  it("dit l'écran ouvert : la source ne vaut plus que `promotions`", async () => {
    const view = await list().execute(new ListPromotionsQuery(null));
    expect(view).toMatchObject({ source: "promotions", editable: true });
  });

  it("restreint au point de retrait demandé (le raccourci du site)", async () => {
    const view = await list().execute(new ListPromotionsQuery("pk_coeur"));
    expect(view.promotions.map((p) => p.id)).toEqual(["p_coeur"]);
    expect(view.promotions[0]).toMatchObject({
      applicationPoint: "basket",
      fulfillment: { kind: "basket", pickup: { points: ["pk_coeur"] }, delivery: "none" },
      audience: { kind: "everyone_but_active_pros", companyId: null },
      effect: { kind: "percent_off", value: 1000 },
    });
  });
});

describe("ListPromotionsHandler — le public à plusieurs cibles (L8b)", () => {
  it("ne montre, filtré par société, que les promotions dont le public la nomme", async () => {
    const view = await list().execute(new ListPromotionsQuery(null, "co_1"));
    expect(view.promotions.map((p) => p.id)).toEqual(["p_co_1"]);
  });

  it("rend les cibles, et projette `several` dans l'ancien champ", async () => {
    const view = await list().execute(new ListPromotionsQuery(null, "co_1"));
    expect(view.promotions[0]).toMatchObject({
      audiences: [
        { kind: "individuals_registered", companyId: null },
        { kind: "company", companyId: "co_1" },
      ],
      audience: { kind: "several", companyId: null },
      audienceLabels: { individuals: null, pros: null },
    });
    expect(view.promotions[0]?.summary).toContain("particuliers inscrits + une société (co_1)");
  });
});

describe("GetPromotionHandler", () => {
  const get = new GetPromotionHandler(
    new FixedBrowser(ALL),
    new FixedPromotionCatalogue(),
    new FixedClock(ASKED),
  );

  it("nomme les cibles de portée par le catalogue servi, `null` pour l'inconnue", async () => {
    const view = await get.execute(new GetPromotionQuery("p_coeur"));
    expect(view.scope.rules.map((rule) => [rule.targetId, rule.name])).toEqual([
      ["p_croissant", "Croissant"],
      ["c_pains", "Pains"],
      ["INCONNU-1", null],
    ]);
    expect(view.summary).toContain("retrait au point pk_coeur");
  });

  it("rend le refus 404 pour une promotion qui n'existe pas", async () => {
    await expect(get.execute(new GetPromotionQuery("absente"))).rejects.toThrow(
      PromotionNotFoundError,
    );
  });
});
