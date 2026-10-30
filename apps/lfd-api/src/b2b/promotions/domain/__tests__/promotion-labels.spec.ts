import type { LabelAudience } from "../promotion-audience-set.js";
import { labelFor, servedLabelFor, type PromotionLabel } from "../promotion-labels.js";

/**
 * Le libellé qu'un client lit (plan des promotions, § 15.4, lot L8b) : celui
 * de son audience dans sa langue, sinon son français, sinon le commun dans
 * sa langue, sinon le commun en français.
 */

const COMMON_FULL: PromotionLabel = { fr: "Commun", en: "Common", it: "Comune" };
const COMMON_FR: PromotionLabel = { fr: "Commun", en: null, it: null };
const OWN_FULL: PromotionLabel = { fr: "Propre", en: "Own", it: "Proprio" };
const OWN_FR: PromotionLabel = { fr: "Propre", en: null, it: null };

type Case = [string, PromotionLabel, PromotionLabel | null, LabelAudience | null, string];

describe("labelFor — le repli, en table", () => {
  it.each<Case>([
    // L'audience a son libellé.
    ["pro, libellé pro traduit, commun traduit", COMMON_FULL, OWN_FULL, "pros", "Own"],
    ["pro, libellé pro traduit, commun français", COMMON_FR, OWN_FULL, "pros", "Own"],
    ["pro, libellé pro français, commun traduit", COMMON_FULL, OWN_FR, "pros", "Propre"],
    ["pro, libellé pro français, commun français", COMMON_FR, OWN_FR, "pros", "Propre"],
    ["particulier, son libellé traduit", COMMON_FULL, OWN_FULL, "individuals", "Own"],
    ["particulier, son libellé français", COMMON_FULL, OWN_FR, "individuals", "Propre"],
    // L'audience n'a pas le sien.
    ["pro sans libellé, commun traduit", COMMON_FULL, null, "pros", "Common"],
    ["pro sans libellé, commun français", COMMON_FR, null, "pros", "Commun"],
    ["particulier sans libellé, commun traduit", COMMON_FULL, null, "individuals", "Common"],
    ["particulier sans libellé, commun français", COMMON_FR, null, "individuals", "Commun"],
    // Audience inconnue : le commun, même si un libellé d'audience existe.
    ["inconnue, libellé d'audience traduit, commun traduit", COMMON_FULL, OWN_FULL, null, "Common"],
    ["inconnue, libellé d'audience français, commun français", COMMON_FR, OWN_FR, null, "Commun"],
    ["inconnue, sans libellé d'audience, commun traduit", COMMON_FULL, null, null, "Common"],
    ["inconnue, sans libellé d'audience, commun français", COMMON_FR, null, null, "Commun"],
  ])("%s → en anglais", (_case, common, own, audience, expected) => {
    const labels = {
      individuals: audience === "individuals" || audience === null ? own : null,
      pros: audience === "pros" || audience === null ? own : null,
    };
    expect(labelFor(common, labels, audience, "en")).toBe(expected);
  });

  it("le libellé de l'AUTRE audience ne sert jamais", () => {
    const labels = { individuals: OWN_FULL, pros: null };
    expect(labelFor(COMMON_FULL, labels, "pros", "fr")).toBe("Commun");
  });

  it("le français se lit toujours en français", () => {
    const labels = { individuals: null, pros: OWN_FULL };
    expect(labelFor(COMMON_FULL, labels, "pros", "fr")).toBe("Propre");
  });
});

describe("servedLabelFor — les trois langues que la trace fige", () => {
  it("n'a aucun trou : chaque langue retombe sur son repli", () => {
    const labels = { individuals: null, pros: { fr: "Offre pro", en: "Pro offer", it: null } };
    expect(servedLabelFor(COMMON_FULL, labels, "pros")).toEqual({
      fr: "Offre pro",
      en: "Pro offer",
      it: "Offre pro",
    });
  });
});
