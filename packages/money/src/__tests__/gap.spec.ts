import { averageGapBp, discountBp, gapBp } from "../gap.js";

/**
 * **L'écart entre deux prix.**
 *
 * Ce qui est éprouvé ici n'est pas la division — c'est le **bord**. La même
 * formule existait en cinq exemplaires avec trois réponses différentes au cas
 * du prix de référence nul ; c'est là, et nulle part ailleurs, que deux écrans
 * se contredisaient.
 */

describe("l'écart, signé", () => {
  it("est POSITIF quand le client paie moins cher", () => {
    // La convention qui compte : « −18,8 % » à l'écran est une remise, donc un
    // écart positif ici. 2,1327 € → 1,7327 €.
    expect(gapBp(213_270, 173_270)).toBe(1876);
  });

  it("est négatif quand le prix monte", () => {
    expect(gapBp(200_000, 220_000)).toBe(-1000);
  });

  it("vaut zéro à prix égal — et zéro est une information", () => {
    expect(gapBp(200_000, 200_000)).toBe(0);
  });

  it("🔴 rend `null` sans prix de référence, jamais zéro", () => {
    // Zéro dirait « même prix ». L'absence de référence n'est pas une égalité :
    // c'est un article que le catalogue ne pousse plus.
    expect(gapBp(null, 173_270)).toBeNull();
  });

  it("🔴 rend `null` sur une référence à zéro plutôt que de diviser par zéro", () => {
    // Un article offert n'a pas d'écart relatif : le ratio n'existe pas.
    expect(gapBp(0, 173_270)).toBeNull();
    expect(gapBp(-1, 173_270)).toBeNull();
  });

  it("arrondit au point de base le plus proche", () => {
    // 213270 → 173270 fait 18,7546… %, soit 1875,46 bp. L'arrondi monte.
    expect(gapBp(213_270, 173_270)).toBe(1876);
  });
});

describe("l'écart vu comme une remise", () => {
  it("ne descend jamais sous zéro", () => {
    // La colonne dit « remise » : un palier qui ne baisse pas le prix n'accorde
    // rien, et « +3 % » y serait un contresens.
    expect(discountBp(200_000, 220_000)).toBe(0);
  });

  it("vaut l'écart quand le prix baisse", () => {
    expect(discountBp(200_000, 180_000)).toBe(1000);
  });

  it("vaut zéro sans référence — une remise absente est une remise nulle", () => {
    // 🔴 La divergence assumée avec `gapBp`. Ici il n'y a rien à afficher comme
    // « inconnu » : une colonne de remise vide se lit « aucune remise ».
    expect(discountBp(0, 173_270)).toBe(0);
  });
});

describe("la moyenne", () => {
  it("ÉCARTE les écarts inconnus au lieu de les compter pour zéro", () => {
    // Le piège : un article sans tarif de référence tirerait la moyenne vers
    // « même prix », et l'écran annoncerait une négociation plus tiède qu'elle
    // ne l'est.
    expect(averageGapBp([2000, null, 1000])).toBe(1500);
  });

  it("rend `null` quand aucun écart n'est connu", () => {
    // Zéro se lirait « il paie le tarif », alors qu'il n'a pas de tarif négocié
    // du tout. Deux phrases très différentes.
    expect(averageGapBp([null, null])).toBeNull();
    expect(averageGapBp([])).toBeNull();
  });

  it("arrondit la moyenne, pas chaque terme", () => {
    expect(averageGapBp([1000, 1001])).toBe(1001);
  });
});
