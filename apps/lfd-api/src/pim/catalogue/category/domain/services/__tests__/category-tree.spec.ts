import { CategoryCycleError, CategoryOrderMismatchError } from "../../errors/category-errors.js";
import { assertCompleteOrder, assertNoCycle, type TreeNode } from "../category-tree.js";

/** a ← b ← c : une lignée de trois. */
const TREE: readonly TreeNode[] = [
  { id: "a", parentId: null },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "b" },
];

describe("assertNoCycle", () => {
  it("refuse de ranger un ancêtre sous son descendant", () => {
    expect(() => assertNoCycle(TREE, "a", "c")).toThrow(CategoryCycleError);
  });

  it("laisse passer un déplacement latéral", () => {
    expect(() => assertNoCycle(TREE, "c", "a")).not.toThrow();
  });

  it("laisse toujours remonter à la racine", () => {
    expect(() => assertNoCycle(TREE, "c", null)).not.toThrow();
  });

  /** Le cas qui boucle si on remonte sans garde : un parent déjà orphelin. */
  it("s’arrête sur une lignée qui sort de l’arbre connu", () => {
    expect(() => assertNoCycle(TREE, "a", "inconnu")).not.toThrow();
  });
});

describe("assertCompleteOrder", () => {
  it("accepte une permutation complète", () => {
    expect(() => assertCompleteOrder(["a", "b"], ["b", "a"], null)).not.toThrow();
  });

  it("refuse un ordre partiel", () => {
    expect(() => assertCompleteOrder(["a", "b"], ["a"], null)).toThrow(CategoryOrderMismatchError);
  });

  it("refuse un intrus", () => {
    expect(() => assertCompleteOrder(["a", "b"], ["a", "z"], null)).toThrow(
      CategoryOrderMismatchError,
    );
  });

  /** Un doublon a la bonne longueur : sans la garde d'unicité, il passerait. */
  it("refuse un doublon", () => {
    expect(() => assertCompleteOrder(["a", "b"], ["a", "a"], null)).toThrow(
      CategoryOrderMismatchError,
    );
  });
});
