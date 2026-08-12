import {
  LEGAL_FORM_OPTIONS,
  legalFormRequiresVat,
  legalFormSchema,
  toLegalForm,
} from "../legal-form.js";

describe("assujettissement à la TVA, par forme", () => {
  it("assujettit les SOCIÉTÉS", () => {
    expect(legalFormRequiresVat("sas")).toBe(true);
    expect(legalFormRequiresVat("sarl")).toBe(true);
    expect(legalFormRequiresVat("sa")).toBe(true);
  });

  it("n'assujettit PAS les formes en franchise", () => {
    // Le cas qui a mis le doigt dessus : un auto-entrepreneur à qui l'écran
    // réclamait un numéro de TVA.
    expect(legalFormRequiresVat("auto_entrepreneur")).toBe(false);
    expect(legalFormRequiresVat("micro")).toBe(false);
    expect(legalFormRequiresVat("ei")).toBe(false);
    expect(legalFormRequiresVat("association")).toBe(false);
  });

  it("tranche pour CHAQUE forme du catalogue", () => {
    // Une forme ajoutée sans décision est une forme dont l'écran devinera.
    for (const form of legalFormSchema.options) {
      expect(typeof legalFormRequiresVat(form)).toBe("boolean");
    }
  });
});

describe("reconnaissance du texte libre déjà en base", () => {
  it("reconnaît la clé elle-même, quelle que soit la casse", () => {
    expect(toLegalForm("SAS")).toBe("sas");
    expect(toLegalForm(" sarl ")).toBe("sarl");
  });

  it("ignore ponctuation et espaces", () => {
    // « S.A.S. » et « SAS » désignent la même chose ; c'est la comparaison de
    // chaînes brutes qui les séparait.
    expect(toLegalForm("S.A.S.")).toBe("sas");
    expect(toLegalForm("Micro entreprise")).toBe("micro");
    expect(toLegalForm("auto entrepreneur")).toBe("auto_entrepreneur");
  });

  it("rattache les graphies héritées", () => {
    expect(toLegalForm("Entreprise individuelle")).toBe("ei");
    expect(toLegalForm("EIRL")).toBe("ei");
    expect(toLegalForm("auto-entreprise")).toBe("auto_entrepreneur");
  });

  it("rend NULL sur l'inconnu plutôt que de deviner", () => {
    expect(toLegalForm("")).toBeNull();
    expect(toLegalForm("société de fait")).toBeNull();
  });
});

describe("catalogue d'options", () => {
  it("couvre l'énumération, dans son ordre", () => {
    expect(LEGAL_FORM_OPTIONS.map((option) => option.value)).toEqual([...legalFormSchema.options]);
  });

  it("nomme chaque forme", () => {
    expect(LEGAL_FORM_OPTIONS.every((option) => option.label !== "")).toBe(true);
  });
});
