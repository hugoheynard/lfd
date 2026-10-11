import {
  FREE_TRANSFORMATIONS_PER_MONTH,
  mediaThresholds,
  PALETTE_STRIP_LIMIT,
  RANKED_SORT_LIMIT,
  thresholdState,
  TRANSFORMATIONS_PER_IMAGE,
} from "../media-thresholds.js";

describe("thresholdState — les bornes", () => {
  it("reste ok à 79 %", () => {
    expect(thresholdState(79, 100)).toBe("ok");
  });

  it("passe en attention à 80 % exactement", () => {
    expect(thresholdState(80, 100)).toBe("attention");
  });

  it("reste en attention juste sous la limite", () => {
    expect(thresholdState(99, 100)).toBe("attention");
  });

  it("est dépassé à 100 % : l'image suivante fait basculer", () => {
    expect(thresholdState(100, 100)).toBe("exceeded");
  });

  it("est dépassé au-delà", () => {
    expect(thresholdState(101, 100)).toBe("exceeded");
  });

  it("dit ok sur un fonds vide", () => {
    expect(thresholdState(0, 100)).toBe("ok");
  });
});

describe("mediaThresholds — ce que la carte rend", () => {
  const byKey = (images: number, key: string): ReturnType<typeof mediaThresholds>[number] => {
    const found = mediaThresholds(images).find((threshold) => threshold.key === key);
    if (found === undefined) {
      throw new TypeError(`seuil ${key} absent`);
    }
    return found;
  };

  it("estime les transformations à quatre par image, et le dit", () => {
    const transformations = byKey(10, "transformations");

    expect(TRANSFORMATIONS_PER_IMAGE).toBe(4);
    expect(transformations).toMatchObject({
      measured: 40,
      limit: FREE_TRANSFORMATIONS_PER_MONTH,
      estimated: true,
      state: "ok",
    });
  });

  it("annonce le payant vers 1 000 images (80 % de 5 000 transformations)", () => {
    expect(byKey(999, "transformations").state).toBe("ok");
    expect(byKey(1_000, "transformations").state).toBe("attention");
  });

  it("dit de souscrire Images & Stream à 1 250 images", () => {
    const transformations = byKey(1_250, "transformations");

    expect(transformations.state).toBe("exceeded");
    expect(transformations.message).toContain("Souscrire Images & Stream");
    expect(transformations.message).toContain("cloudflare-images.md §5");
  });

  it("juge le tri par emplois sur le compte du fonds, avec son geste de sortie", () => {
    const ranked = byKey(RANKED_SORT_LIMIT, "ranked-sort");

    expect(ranked).toMatchObject({ measured: RANKED_SORT_LIMIT, state: "exceeded" });
    expect(ranked.message).toContain("Restreindre avant de trier");
    expect(byKey(3_999, "ranked-sort").state).toBe("ok");
    expect(byKey(4_000, "ranked-sort").state).toBe("attention");
  });

  it("annonce la pré-agrégation de la frise", () => {
    expect(byKey(PALETTE_STRIP_LIMIT * 0.8, "palette-strip").message).toContain(
      "Pré-agréger la frise",
    );
    expect(byKey(PALETTE_STRIP_LIMIT - 4_001, "palette-strip").state).toBe("ok");
  });

  it("cite la source de chaque limite", () => {
    for (const threshold of mediaThresholds(0)) {
      expect(threshold.source).toMatch(/^documentation\/.+\.md §/);
    }
  });
});
