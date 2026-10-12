import {
  HOLDER_LEGAL_FORM_LABELS,
  LEGAL_FORM_LABELS,
  LEGAL_FORM_OPTIONS,
  listedHolderLegalForm,
  holderLegalFormOf,
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

describe("la liste fermée de la forme du titulaire d'un RIB", () => {
  it("met les civilités en tête, puis chaque forme de l'identité, par son libellé", () => {
    expect(HOLDER_LEGAL_FORM_LABELS.slice(0, 3)).toEqual(["M.", "Mme", "Mlle"]);
    expect(HOLDER_LEGAL_FORM_LABELS.slice(3)).toEqual(
      legalFormSchema.options
        .filter((form) => form !== "micro" && form !== "auto_entrepreneur")
        .map((form) => LEGAL_FORM_LABELS[form]),
    );
  });

  it("n'a ni micro-entreprise ni auto-entrepreneur : leur titulaire est une entreprise individuelle", () => {
    expect(HOLDER_LEGAL_FORM_LABELS).not.toContain("Micro-entreprise");
    expect(HOLDER_LEGAL_FORM_LABELS).not.toContain("Auto-entrepreneur");
    expect(holderLegalFormOf("micro")).toBe("Entreprise individuelle");
    expect(holderLegalFormOf("auto_entrepreneur")).toBe("Entreprise individuelle");
    expect(holderLegalFormOf("sas")).toBe("SAS");
    expect(listedHolderLegalForm("Micro-entreprise")).toBeNull();
  });

  it("tient dans la case de 40 caractères du mandat", () => {
    expect(Math.max(...HOLDER_LEGAL_FORM_LABELS.map((label) => label.length))).toBeLessThanOrEqual(
      40,
    );
  });

  it("reconnaît une entrée à la casse près, et rien d'autre", () => {
    expect(listedHolderLegalForm(" sas ")).toBe("SAS");
    expect(listedHolderLegalForm("société de droit étranger")).toBe("Société de droit étranger");
    expect(listedHolderLegalForm("Col Pers SAS")).toBeNull();
    expect(listedHolderLegalForm("sas_u")).toBeNull();
  });
});
