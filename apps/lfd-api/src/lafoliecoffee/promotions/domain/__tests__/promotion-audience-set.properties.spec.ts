import type { PromotionAudience, PromotionAudienceKind } from "../promotion-audience.js";
import { PromotionAudienceSet } from "../promotion-audience-set.js";

/**
 * Propriétés de l'arbre des publics, éprouvées sur TOUS les sous-ensembles
 * non vides des huit publics de clientèle (255 cas — exhaustif plutôt
 * qu'aléatoire : l'espace est assez petit pour ne rien laisser au hasard).
 */
const CLIENTELE: readonly PromotionAudienceKind[] = [
  "everyone",
  "individuals",
  "individuals_guest",
  "individuals_registered",
  "pros",
  "pros_active",
  "pros_pending",
  "everyone_but_active_pros",
];

const subsets: PromotionAudience[][] = [];
for (let mask = 1; mask < 1 << CLIENTELE.length; mask += 1) {
  subsets.push(
    CLIENTELE.filter((_, index) => (mask & (1 << index)) !== 0).map(
      (kind) => ({ kind }) as PromotionAudience,
    ),
  );
}

const leavesKey = (set: PromotionAudienceSet) => [...set.leaves].sort().join(",");

describe("PromotionAudienceSet — propriétés sur tous les sous-ensembles", () => {
  it("la normalisation est idempotente", () => {
    for (const targets of subsets) {
      const once = PromotionAudienceSet.of(targets);
      expect(PromotionAudienceSet.of(once.targets).targets).toEqual(once.targets);
    }
  });

  it("la normalisation conserve la couverture en feuilles", () => {
    for (const targets of subsets) {
      const expected = new Set(
        targets.flatMap((target) => [...PromotionAudienceSet.of([target]).leaves]),
      );
      expect(new Set(PromotionAudienceSet.of(targets).leaves)).toEqual(expected);
    }
  });

  it("l'ordre de saisie ne change pas la forme canonique", () => {
    for (const targets of subsets) {
      expect(PromotionAudienceSet.of([...targets].reverse()).targets).toEqual(
        PromotionAudienceSet.of(targets).targets,
      );
    }
  });

  it("deux publics de même couverture ont la même forme (sauf la reprise seule)", () => {
    const byCoverage = new Map<string, PromotionAudienceSet>();
    for (const targets of subsets) {
      const set = PromotionAudienceSet.of(targets);
      const seen = byCoverage.get(leavesKey(set));
      if (seen !== undefined) {
        expect(set.targets).toEqual(seen.targets);
      }
      byCoverage.set(leavesKey(set), set);
    }
  });

  it("le croisement est symétrique et nul exactement quand les couvertures sont disjointes", () => {
    const sets = subsets.map((targets) => PromotionAudienceSet.of(targets));
    for (const left of sets) {
      for (const right of sets) {
        const disjoint = [...left.leaves].every((leaf) => !right.leaves.has(leaf));
        expect(left.crossing(right) === null).toBe(disjoint);
        expect(right.crossing(left) === null).toBe(disjoint);
      }
    }
  });

  it("`restore` d'une forme canonique rend la même forme", () => {
    for (const targets of subsets) {
      const set = PromotionAudienceSet.of(targets);
      expect(PromotionAudienceSet.restore(set.targets).targets).toEqual(set.targets);
    }
  });
});
