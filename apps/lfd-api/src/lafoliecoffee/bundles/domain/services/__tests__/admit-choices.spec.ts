import {
  BundleChoiceNotServedToPublicError,
  BundleChoiceOperationOnlyError,
  UnknownBundleChoicesError,
} from "../../errors/bundle-errors.js";
import type {
  BundleChoiceArticle,
  BundleChoiceVerdict,
} from "../../ports/bundle-choice-article.js";
import { admitChoices } from "../admit-choices.js";

function article(sku: string, verdict: BundleChoiceVerdict): BundleChoiceArticle {
  return { sku, name: `Article ${sku}`, shelf: "Viennoiseries", thumbnailUrl: null, verdict };
}

const CATALOGUE = new Map(
  [
    article("OK-1", "admissible"),
    article("PRO-1", "not_served_to_public"),
    article("OP-1", "operation_only"),
  ].map((entry) => [entry.sku, entry]),
);

describe("admitChoices", () => {
  it("admet les articles servis au public et pas réservés aux opérations", () => {
    expect(() => admitChoices(["OK-1"], CATALOGUE)).not.toThrow();
    expect(() => admitChoices([], CATALOGUE)).not.toThrow();
  });

  it("refuse un SKU inconnu, en le nommant", () => {
    expect(() => admitChoices(["OK-1", "NOPE"], CATALOGUE)).toThrow(
      new UnknownBundleChoicesError(["NOPE"]),
    );
  });

  it("refuse un article pas servi au public, en disant lequel", () => {
    const refusal = new BundleChoiceNotServedToPublicError(["« Article PRO-1 » (PRO-1)"]);

    expect(() => admitChoices(["PRO-1", "OP-1"], CATALOGUE)).toThrow(refusal);
  });

  it("refuse un article réservé aux opérations", () => {
    expect(() => admitChoices(["OP-1"], CATALOGUE)).toThrow(BundleChoiceOperationOnlyError);
  });
});
