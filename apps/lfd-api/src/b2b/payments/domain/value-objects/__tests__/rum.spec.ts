import { InvalidRumError } from "../../errors/mandate-errors.js";
import { Rum, RUM_EPC_MAX_LENGTH, RUM_PREFIX, RUM_PRINTED_MAX_LENGTH } from "../rum.js";

/** Une référence société telle que `referenceFrom` en rend. */
const CUSTOMER = "C-9P2X4B";

/** Un tirage tel que `SecretGenerator` en rend : 26 symboles de base 32. */
const SECRET = "K7M3QTAB1CD2EF3GH4JK5MN6PQ";

/** Midi à Paris — loin de tout basculement de jour, sauf là où on le cherche. */
const NOON = new Date("2026-09-12T12:00:00.000Z");

function mint(over: Partial<Parameters<typeof Rum.mint>[0]> = {}): Rum {
  return Rum.mint({ customerReference: CUSTOMER, at: NOON, secret: SECRET, ...over });
}

describe("Rum.mint", () => {
  it("frappe la forme décidée : préfixe, client, date de frappe, tirage", () => {
    expect(mint().value).toBe("LFC-9P2X4B-260912-K7M3QT");
  });

  it("tient dans le peigne du formulaire, qui tronquerait en silence", () => {
    expect(mint().value.length).toBeLessThanOrEqual(RUM_PRINTED_MAX_LENGTH);
  });

  it("reprend le code du client sans son préfixe de référence", () => {
    // `C-` identifie une société dans NOTRE numérotation ; il ne distingue
    // aucune RUM d'une autre, et chaque case du peigne est comptée.
    expect(mint().value).toContain("-9P2X4B-");
    expect(mint().value.startsWith(`${RUM_PREFIX}-`)).toBe(true);
  });

  it("distingue deux mandats du même client le même jour", () => {
    const other = mint({ secret: "ZZZZZZAB1CD2EF3GH4JK5MN6PQ" });
    expect(other.value).not.toBe(mint().value);
  });

  it("distingue deux clients du même jour au même tirage", () => {
    expect(mint({ customerReference: "C-7WT4NA" }).value).not.toBe(mint().value);
  });

  /**
   * Régression : l'estampille se lisait en UTC. Un mandat frappé après 22h00
   * l'été portait la date de la VEILLE, pendant que l'écran affichait le jour
   * même — l'écart ne se serait vu que sur un papier déjà signé.
   */
  it("date à Europe/Paris, pas en UTC", () => {
    // 22h30 UTC le 12 septembre = 00h30 le 13 à Paris (UTC+2 en été).
    const justAfterMidnightInParis = new Date("2026-09-12T22:30:00.000Z");
    expect(mint({ at: justAfterMidnightInParis }).value).toContain("-260913-");
  });

  it("date à Europe/Paris aussi en heure d'hiver", () => {
    // 23h30 UTC le 12 janvier = 00h30 le 13 à Paris (UTC+1 en hiver).
    const winter = new Date("2026-01-12T23:30:00.000Z");
    expect(mint({ at: winter }).value).toContain("-260113-");
  });

  it("ne porte que des caractères du jeu SEPA restreint", () => {
    // Le trait d'union en fait partie ; un accent ferait rejeter le FICHIER.
    expect(mint().value).toMatch(/^[A-Za-z0-9/\-?:().,'+ ]+$/u);
  });

  it("refuse une référence client sans aucun symbole utilisable", () => {
    expect(() => mint({ customerReference: "  -- " })).toThrow(InvalidRumError);
  });

  it("refuse un instant de frappe invalide plutôt que d'estampiller « NaNNaN »", () => {
    expect(() => mint({ at: new Date("pas une date") })).toThrow(InvalidRumError);
  });

  it("refuse un tirage trop court plutôt que de rendre une RUM courte", () => {
    // Un tirage amputé réduirait l'aléa sans que rien ne le signale.
    expect(() => mint({ secret: "K7M" })).toThrow(InvalidRumError);
  });
});

describe("Rum.create", () => {
  it("relit une référence que nous avons frappée", () => {
    expect(Rum.create("LFC-9P2X4B-260912-K7M3QT").value).toBe("LFC-9P2X4B-260912-K7M3QT");
  });

  /**
   * Régression : la relecture appliquait la borne du papier (26). Une référence
   * posée par Stripe, ou reprise d'un portefeuille, dépasse ce seuil — et la
   * rehydratation d'un mandat parfaitement valide échouait.
   */
  it("relit jusqu'à la borne EPC, au-delà du peigne", () => {
    const legacy = "A".repeat(RUM_EPC_MAX_LENGTH);
    expect(legacy.length).toBeGreaterThan(RUM_PRINTED_MAX_LENGTH);
    expect(Rum.create(legacy).value).toBe(legacy);
  });

  it("refuse au-delà de la borne EPC", () => {
    expect(() => Rum.create("A".repeat(RUM_EPC_MAX_LENGTH + 1))).toThrow(InvalidRumError);
  });

  it("refuse un accent, qui ferait rejeter le fichier entier", () => {
    expect(() => Rum.create("LFC-RÉFÉRENCE")).toThrow(InvalidRumError);
  });

  it("refuse une référence vide", () => {
    expect(() => Rum.create("   ")).toThrow(InvalidRumError);
  });
});
