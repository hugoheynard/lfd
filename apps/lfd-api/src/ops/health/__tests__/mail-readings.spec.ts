import { mailReadings, webhookReading, type MailTally } from "../mail-readings.js";

const tally = (over: Partial<MailTally> = {}): MailTally => ({
  sent: 0,
  delayed: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  ...over,
});

describe("mailReadings — est-ce que nos e-mails ARRIVENT", () => {
  it("ne dit rien quand rien n'est parti", () => {
    // « 0 envoyé » se lirait comme une panne alors que c'est un dimanche. Un
    // relevé absent vaut mieux qu'un zéro qui ressemble à une mesure.
    expect(mailReadings(tally(), null)).toEqual([]);
  });

  it("compte TOUT ce qui est parti, quel que soit son état", () => {
    const [sent] = mailReadings(tally({ delivered: 8, bounced: 1, sent: 3 }), null);

    expect(sent).toMatchObject({ label: "Envoyés", value: 12 });
  });

  it("🔴 ne compte PAS « sans retour » comme un rejet", () => {
    // Resend n'a pas encore dit, ou l'événement n'est jamais venu. Le compter
    // comme un rejet ferait rougir le canal pour une lenteur.
    const [envoyés, rejetés] = mailReadings(tally({ sent: 5, delayed: 2, delivered: 1 }), null);

    expect(rejetés?.value).toBe(0);
    expect(envoyés?.hint).toContain("7 sans retour");
  });

  it("additionne les plaintes AUX rebonds", () => {
    // Une plainte est une personne qui a reçu et n'en voulait pas : elle ne se
    // range pas avec les succès sous prétexte que le message est arrivé.
    const [, rejetés] = mailReadings(tally({ delivered: 10, bounced: 2, complained: 1 }), null);

    expect(rejetés?.value).toBe(3);
  });

  it("désigne le gabarit qui rebondit le plus", () => {
    // « 3 rejets » envoie chercher ; « surtout customer.access-opened » se
    // règle — c'est la liste d'invitations qu'il faut nettoyer.
    const [, rejetés] = mailReadings(tally({ bounced: 3 }), "customer.access-opened");

    expect(rejetés?.hint).toContain("customer.access-opened");
  });

  it("dit que le canal passe quand rien n'est rejeté", () => {
    const [, rejetés] = mailReadings(tally({ delivered: 40 }), null);

    expect(rejetés).toMatchObject({ value: 0 });
    expect(rejetés?.hint).toContain("le canal passe");
  });
});

describe("webhookReading — sera-t-on prévenu si ça casse ?", () => {
  it("s'abstient quand on n'a pas pu demander", () => {
    // Ne rien savoir n'est pas savoir que c'est cassé.
    expect(webhookReading(null)).toEqual([]);
  });

  it("🔴 alerte quand la déclaration est en défaut", () => {
    // C'est le relevé qui décide d'un geste : sans webhook, « 0 rejeté » est le
    // chiffre le plus rassurant de l'écran, et le plus faux.
    const [reading] = webhookReading({ healthy: false, detail: "webhook DÉSACTIVÉ" });

    expect(reading?.value).toBe(0);
    expect(reading?.hint).toContain("ne veut plus rien dire");
  });

  it("se contente de confirmer quand tout va", () => {
    const [reading] = webhookReading({ healthy: true, detail: "actif" });

    expect(reading).toMatchObject({ label: "Retour", value: 1 });
  });
});
