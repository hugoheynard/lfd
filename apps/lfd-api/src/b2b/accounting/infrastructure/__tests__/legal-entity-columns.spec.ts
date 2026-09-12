import { LegalEntity } from "../../domain/entities/legal-entity.js";
import { LegalAddress } from "../../domain/value-objects/legal-address.js";
import { Siren } from "../../domain/value-objects/siren.js";
import { legalEntityColumns } from "../legal-entity.mapper.js";

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
  it("écrit TOUT l'état, sauf l'identité", () => {
    const snapshot = declared().toPersistence();
    const written = Object.keys(legalEntityColumns(snapshot)).sort();
    const expected = Object.keys(snapshot)
      .filter((key) => key !== "id")
      .sort();

    expect(written).toEqual(expected);
  });

  it("n'écrit PAS l'identifiant — il n'a rien à faire dans un update", () => {
    expect(Object.keys(legalEntityColumns(declared().toPersistence()))).not.toContain("id");
  });

  it("porte les réglages de mandat, qui manquaient", () => {
    const columns = legalEntityColumns(declared().toPersistence());
    expect(columns.mandateContractDescription).toBe("");
    expect(columns.mandatePaymentType).toBe("recurrent");
  });
});
