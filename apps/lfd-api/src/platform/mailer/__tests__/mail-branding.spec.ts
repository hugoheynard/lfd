import { b2bMailTemplates } from "../mail-templates.js";

/**
 * **Un courriel se présente sous la marque que son destinataire connaît.**
 *
 * `La Folie Coffee` est l'enseigne du CLIENT — le nom de la boutique, du
 * domaine, de ce qu'il a commandé. `La Folie Douce` est la maison, celle que
 * l'ÉQUIPE voit dans son back-office. Se présenter sous l'autre nom se lit
 * comme une tentative d'hameçonnage : le destinataire ne reconnaît pas
 * l'expéditeur, et le bon réflexe — ne pas cliquer — est alors le mauvais pour
 * nous.
 *
 * 🔴 **Ce cas existe parce qu'une seule coquille servait les deux publics** et
 * posait « La Folie Douce » partout (relevé par Hugo le 2026-09-22). La
 * correction a été de nommer les coquilles d'après leur public ; ce test tient
 * ce que le nom ne peut pas tenir tout seul — que personne n'appelle la
 * mauvaise.
 *
 * Il parcourt **tout le registre** : un gabarit ajouté demain y entre sans
 * qu'on y pense, et c'est tout l'intérêt de partir des clés plutôt que d'une
 * liste écrite à la main.
 */
const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

/**
 * Trois publics, pas deux : `customer.` (le client), `staff.` (l'équipe) et
 * `ops.` (l'exploitation — un courrier de contrôle que le déploiement s'envoie
 * à lui-même). Seul le premier voit l'enseigne de la boutique ; les deux autres
 * sont internes et relèvent de la maison.
 */
const AUDIENCES = ["customer.", "staff.", "ops."] as const;

/** L'enseigne attendue, déduite du seul préfixe de la clé. */
function expectedBrand(key: string): string {
  return key.startsWith("customer.") ? "La Folie Coffee" : "La Folie Douce";
}

/** L'autre marque — celle qui ne doit apparaître nulle part dans ce message. */
function forbiddenBrand(key: string): string {
  return key.startsWith("customer.") ? "La Folie Douce" : "La Folie Coffee";
}

describe("Les courriels se présentent sous la marque de leur destinataire", () => {
  const keys = Object.keys(REGISTRY);

  /**
   * La règle tient **parce que** la clé dit le public. Un gabarit nommé
   * autrement échapperait à tout ce fichier sans rien faire échouer : c'est
   * donc la première chose à tenir.
   */
  it("le registre porte des clés, et toutes disent leur public", () => {
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(AUDIENCES.some((prefix) => key.startsWith(prefix))).toBe(true);
    }
  });

  /**
   * On ne rend pas chaque gabarit — leurs charges sont hétérogènes, et les
   * fabriquer toutes ferait de ce fichier un second jeu de fixtures à tenir à
   * jour. On lit la SOURCE : chaque cas du registre doit passer par la coquille
   * de son public, et aucune ne doit nommer l'autre marque en dur.
   */
  it("chaque clé nomme une marque, et une seule", () => {
    for (const key of keys) {
      const source = REGISTRY[key as keyof typeof REGISTRY].toString();
      expect(source).not.toContain(forbiddenBrand(key));
    }
  });

  it("les coquilles sont nommées d'après leur public", () => {
    for (const key of keys) {
      const source = REGISTRY[key as keyof typeof REGISTRY].toString();
      const helper = key.startsWith("customer.") ? "customerMail" : "staffMail";
      const other = key.startsWith("customer.") ? "staffMail" : "customerMail";
      // Tous les gabarits ne passent pas par une coquille « personne » : deux
      // courriels d'équipe rendent la mise en page directement. On n'exige donc
      // pas la présence de la bonne — on interdit la mauvaise.
      expect(source).not.toContain(other);
      if (source.includes("Mail(")) {
        expect(source).toContain(helper);
      }
    }
  });

  it("le lien de mot de passe du client se présente sous l’enseigne de la boutique", () => {
    const mail = REGISTRY["customer.password-reset"]({
      passwordSetupUrl: "https://tenant.eu.auth0.com/lo/reset?ticket=xyz",
    });

    expect(mail.html).toContain(expectedBrand("customer.password-reset"));
    expect(mail.html).not.toContain(forbiddenBrand("customer.password-reset"));
    expect(mail.subject).toBe("Votre lien pour changer de mot de passe");
  });
});
