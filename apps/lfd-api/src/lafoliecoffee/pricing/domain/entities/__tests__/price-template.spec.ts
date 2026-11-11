import { BusinessError, DomainError } from "../../../../../platform/shared/errors/app-error.js";
import { PriceTemplate, type PriceTemplateDraft } from "../price-template.js";
import {
  ArchivedPriceTemplateIsSealedError,
  ArchivedPriceTemplateNotPosableError,
} from "../../pricing-errors.js";

const GRILLE: PriceTemplateDraft = {
  kind: "mercuriale",
  label: "Mercuriale Club Med",
  lines: [
    {
      sku: "VIE-001",
      tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }],
      plannedVolume: null,
    },
  ],
};

const archive = (): PriceTemplate =>
  PriceTemplate.compose("tpl_1", GRILLE, "auth0|staff").archive(new Date());

/**
 * **Le scellement d'un gabarit archivé, et sa CATÉGORIE.**
 *
 * La catégorie est le sujet, pas le refus. `Archived*IsSealedError` vaut
 * **409** partout ailleurs dans ce contexte ; le gabarit répondait **400**,
 * c'est-à-dire « votre saisie est mauvaise » là où aucune saisie ne pouvait
 * passer. C'est ce qui restait de R18 (fix 2026-09-09).
 */
describe("un gabarit archivé est scellé", () => {
  it("refuse de retoucher une grille archivée", () => {
    expect(() => archive().revise(GRILLE)).toThrow(ArchivedPriceTemplateIsSealedError);
  });

  /** Régression : un gabarit archivé se posait encore chez un client par `POST …/:id/apply`. */
  it("refuse de se poser chez un client", () => {
    expect(() => archive().linesToPose()).toThrow(ArchivedPriceTemplateNotPosableError);
  });

  it("un gabarit vivant rend ses lignes à poser", () => {
    const lines = PriceTemplate.compose("tpl_1", GRILLE, "auth0|staff").linesToPose();
    expect(lines.map((line) => line.sku)).toEqual(["VIE-001"]);
  });

  it("refuse de l'archiver deux fois", () => {
    expect(() => archive().archive(new Date())).toThrow(ArchivedPriceTemplateIsSealedError);
  });

  /**
   * Régression R18 : `BusinessError` → **409**, et non `DomainError` → 400.
   * L'assertion porte sur la classe de base, seule chose que le filtre HTTP
   * lit ; assurer le nom de l'erreur laisserait passer un changement de socle.
   */
  it("le refuse en CONFLIT, pas en saisie invalide", () => {
    let caught: unknown;
    try {
      archive().revise(GRILLE);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BusinessError);
    expect(caught).not.toBeInstanceOf(DomainError);
  });
});
