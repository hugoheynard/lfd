import { PromotionAudienceLabelWithoutAudienceError } from "../errors/promotion-audience-errors.js";
import { PromotionBlankTextError } from "../errors/promotion-errors.js";
import { Promotion } from "../promotion.js";
import { PromotionAudienceSet } from "../promotion-audience-set.js";
import { FROM, lineTerms } from "./promotion-terms.fixture.js";

/**
 * Les libellés d'audience de l'agrégat (plan des promotions, § 15.4, lot
 * L8b) : facultatifs (§ 15.12 Q2), présents seulement pour une audience que
 * le public touche, jamais vides.
 */

const STAFF = "staff_hugo";
const PROS = { fr: "Offre pro", en: null, it: null };

describe("Promotion — les libellés d'audience", () => {
  it("le libellé commun suffit : aucun libellé d'audience n'est exigé", () => {
    const both = PromotionAudienceSet.of([{ kind: "individuals" }, { kind: "pros" }]);
    expect(() => Promotion.pose("p", lineTerms({ audiences: both }), STAFF, FROM)).not.toThrow();
  });

  it("refuse un libellé Pros sur un public de particuliers seulement", () => {
    const terms = lineTerms({
      audience: { kind: "individuals_registered" },
      audienceLabels: { individuals: null, pros: PROS },
    });
    expect(() => Promotion.pose("p", terms, STAFF, FROM)).toThrow(
      new PromotionAudienceLabelWithoutAudienceError("pros"),
    );
  });

  it("admet un libellé Pros pour une société nommée : elle est sous la branche Pros", () => {
    const terms = lineTerms({
      audience: { kind: "company", companyId: "co_1" },
      audienceLabels: { individuals: null, pros: PROS },
    });
    expect(() => Promotion.pose("p", terms, STAFF, FROM)).not.toThrow();
  });

  it("refuse un libellé d'audience vide, en nommant le champ", () => {
    const terms = lineTerms({
      audienceLabels: { individuals: { fr: " ", en: null, it: null }, pros: null },
    });
    expect(() => Promotion.pose("p", terms, STAFF, FROM)).toThrow(
      new PromotionBlankTextError("libellé Particuliers"),
    );
  });

  it("refuse aussi à la révision", () => {
    const posed = Promotion.pose("p", lineTerms({ audience: { kind: "pros" } }), STAFF, FROM);
    expect(() =>
      posed.revise(
        lineTerms({
          audience: { kind: "pros" },
          audienceLabels: { individuals: PROS, pros: null },
        }),
      ),
    ).toThrow(PromotionAudienceLabelWithoutAudienceError);
  });
});
