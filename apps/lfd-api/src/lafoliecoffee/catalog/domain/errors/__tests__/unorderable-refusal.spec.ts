import { ArticleOffMenuError } from "../article-off-menu.error.js";
import {
  refuseUnorderable,
  ReservedArticleRefusedError,
} from "../reserved-article-refused.error.js";

/** Le refus du chemin qui facture (`plan-carte-des-sites.md`, § 3.7). */
describe("refuseUnorderable", () => {
  const found = new Map([
    ["OPEN", { reservation: "none", menu: "on" }],
    ["RESERVED", { reservation: "other", menu: "on" }],
    ["OFF", { reservation: "none", menu: "off" }],
  ] as const);

  it("laisse passer ce qui se commande, et ce que le catalogue n'a pas rendu", () => {
    expect(() => refuseUnorderable(found, ["OPEN", "UNKNOWN"])).not.toThrow();
  });

  it("refuse un hors-carte par son nom, en 409, avec le geste de sortie", () => {
    const refusal = captured(() => refuseUnorderable(found, ["OPEN", "OFF"]));
    expect(refusal).toBeInstanceOf(ArticleOffMenuError);
    expect(refusal).toMatchObject({ sku: "OFF", code: "catalog.article_off_menu" });
    expect(refusal?.message).toContain("compte principal");
    expect(refusal?.message).toContain("carte du site");
  });

  it("refuse le premier dans l'ordre demandé", () => {
    expect(captured(() => refuseUnorderable(found, ["RESERVED", "OFF"]))).toBeInstanceOf(
      ReservedArticleRefusedError,
    );
  });
});

function captured(run: () => void): Error | undefined {
  try {
    run();
    return undefined;
  } catch (error: unknown) {
    return error instanceof Error ? error : undefined;
  }
}
