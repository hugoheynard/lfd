import { LegalEntity } from "../../domain/entities/legal-entity.js";
import { Bic } from "../../domain/value-objects/bic.js";
import { CreditorAccount } from "../../domain/value-objects/creditor-account.js";
import { Iban } from "../../domain/value-objects/iban.js";
import { LegalAddress } from "../../domain/value-objects/legal-address.js";
import { Siren } from "../../domain/value-objects/siren.js";
import { AesGcmFieldCipher } from "../../../../platform/crypto/aes-gcm-field-cipher.js";
import { legalEntityColumns } from "../legal-entity.mapper.js";

/** Une clé de test — 32 octets, la seule contrainte du coffre. */
const CIPHER = new AesGcmFieldCipher(Buffer.alloc(32, 7));

function declared(): LegalEntity {
  return LegalEntity.declare({
    id: "01JBXY000000000000000000LE",
    name: "Crazeativity",
    legalForm: "SAS",
    siren: Siren.create("900000001"),
    rcs: "Chambéry",
    shareCapitalCents: 1_000_000,
    vatNumber: "",
    address: LegalAddress.create({
      line1: "Route de la Balme",
      line2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
    }),
  });
}

describe("legalEntityColumns", () => {
  /**
   * 🔴 LE test de ce fichier, et il ne regarde aucune valeur — seulement les
   * CLÉS.
   *
   * La liste des colonnes écrites est explicite (ni `id`, ni horodatages dans un
   * `update`), donc un champ ajouté à l'agrégat et oublié ici s'écrit **sans
   * erreur** : la commande réussit, l'écran annonce « enregistré », et la
   * relecture rend l'ancienne valeur. C'est arrivé le 2026-09-12 avec les
   * réglages de mandat — le semis disait « posés » sur une colonne vide, et rien
   * dans le typage ne l'a vu.
   *
   * Ce test échoue au prochain oubli, au lieu de le laisser se découvrir devant
   * un écran qui ment.
   */
  it("écrit TOUT l'état, sauf l'identité et le verrou du premier mandat", () => {
    const snapshot = declared().toPersistence();
    const written = Object.keys(legalEntityColumns(snapshot, CIPHER)).sort();
    // `creditorIban` sort de la liste et `creditorIbanSealed` y entre : c'est la
    // bascule du 2026-09-12, où la colonne claire cesse d'être alimentée pour
    // ne plus servir que de retour arrière. Le test dit la substitution plutôt
    // que de la subir — sans quoi il suffirait de retirer une colonne pour le
    // faire passer.
    //
    // `firstMandateIssuedAt` sort aussi, et c'est une EXCLUSION voulue, pas un
    // oubli (plan `plan-restes-du-mandat.md` §7 #6, 2026-09-15) : le verrou n'a
    // qu'un auteur, `FirstMandateLedger`, qui l'écrit sous condition dans la
    // transaction de la frappe. Réécrit par `save`, il serait remis à `null` par
    // tout geste staff ayant chargé l'entité avant une frappe concurrente.
    const excluded = new Set(["id", "creditorIban", "firstMandateIssuedAt"]);
    const expected = Object.keys(snapshot)
      .filter((key) => !excluded.has(key))
      .concat("creditorIbanSealed")
      .sort();

    expect(written).toEqual(expected);
  });

  it("n'écrit PAS l'identifiant — il n'a rien à faire dans un update", () => {
    expect(Object.keys(legalEntityColumns(declared().toPersistence(), CIPHER))).not.toContain("id");
  });

  /**
   * 🔴 Régression : notre IBAN créancier dormait EN CLAIR pendant que celui du
   * client était scellé. Personne n'avait décidé l'asymétrie — le coffre a été
   * bâti pour le compte qu'on débite, et celui où l'argent arrive est resté où
   * il était.
   */
  it("scelle l'IBAN créancier — il ne part jamais en clair en base", () => {
    const entity = declared();
    entity.setCreditorAccount(
      CreditorAccount.create({
        holder: "CRAZEATIVITY",
        iban: Iban.create("FR7630006000011234567890189"),
        bic: Bic.create("CEPAFRPP751"),
        address: LegalAddress.create({
          line1: "Route de la Balme",
          line2: "",
          postalCode: "73150",
          city: "Val d'Isère",
          countryCode: "FR",
        }),
      }),
    );

    const columns = legalEntityColumns(entity.toPersistence(), CIPHER);

    expect(columns.creditorIbanSealed).not.toContain("FR7630006000011234567890189");
    expect(columns.creditorIbanSealed?.startsWith("v1.")).toBe(true);
    expect(CIPHER.open(columns.creditorIbanSealed!)).toBe("FR7630006000011234567890189");
  });

  /**
   * 🔴 Régression prévenue (plan `plan-restes-du-mandat.md` §7 #6) : `save`
   * réécrivait toute la ligne, verrou compris. Une entité chargée avant la
   * frappe et sauvée après effaçait `first_mandate_issued_at`.
   */
  it("n'écrit PAS le verrou du premier mandat, même posé sur l'état", () => {
    const frozen = LegalEntity.reconstitute({
      ...declared().toPersistence(),
      firstMandateIssuedAt: new Date("2026-09-12T08:00:00.000Z"),
    });

    expect(Object.keys(legalEntityColumns(frozen.toPersistence(), CIPHER))).not.toContain(
      "firstMandateIssuedAt",
    );
  });

  it("laisse le scellé à null quand aucun IBAN n'est renseigné", () => {
    expect(legalEntityColumns(declared().toPersistence(), CIPHER).creditorIbanSealed).toBeNull();
  });

  it("porte les réglages de mandat, qui manquaient", () => {
    const columns = legalEntityColumns(declared().toPersistence(), CIPHER);
    expect(columns.mandateContractDescription).toBe("");
    expect(columns.mandatePaymentType).toBe("recurrent");
  });
});
