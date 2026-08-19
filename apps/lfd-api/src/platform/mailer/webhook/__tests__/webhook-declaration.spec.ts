import { checkDeclaration, EXPECTED_EVENTS, type DeclaredWebhook } from "../webhook-declaration.js";

const hook = (over: Partial<DeclaredWebhook> = {}): DeclaredWebhook => ({
  endpoint: "https://lfc.example/api/b2b/webhooks/resend",
  status: "enabled",
  events: [...EXPECTED_EVENTS],
  ...over,
});

describe("checkDeclaration — l'état du webhook, sans rien muter", () => {
  it("accepte un webhook actif portant tous les événements attendus", () => {
    expect(checkDeclaration([hook()])).toMatchObject({ healthy: true, active: 1 });
  });

  it("voit qu'aucun webhook n'est déclaré", () => {
    // Aujourd'hui indiscernable d'un canal qui marche : les e-mails partent, et
    // rien ne revient jamais — sans que rien ne le dise.
    expect(checkDeclaration([])).toMatchObject({ healthy: false, active: 0 });
  });

  it("🔴 voit un webhook DÉSACTIVÉ par Resend", () => {
    // Le cas silencieux : Resend éteint un endpoint qui échoue trop. Personne
    // n'a rien changé, et plus rien ne revient.
    const verdict = checkDeclaration([hook({ status: "disabled" })]);

    expect(verdict.healthy).toBe(false);
    expect(verdict.detail).toContain("DÉSACTIVÉ");
  });

  it("🔴 signale un événement manquant plutôt que de croire au vert", () => {
    // Le plus trompeur : les livraisons arrivent, tout paraît sain, et les
    // rebonds ne viennent jamais.
    const verdict = checkDeclaration([
      hook({ events: EXPECTED_EVENTS.filter((event) => event !== "email.bounced") }),
    ]);

    expect(verdict.healthy).toBe(false);
    expect(verdict.detail).toContain("email.bounced");
  });

  it("refuse deux endpoints actifs sur la même route", () => {
    // Il en reste un d'avant un changement d'adresse : les événements partent
    // aux deux, et on ne sait plus lequel fait foi.
    expect(checkDeclaration([hook(), hook()])).toMatchObject({ healthy: false, active: 2 });
  });

  it("ignore les webhooks d'une autre route que la nôtre", () => {
    const verdict = checkDeclaration([
      hook({ endpoint: "https://autre.example/hooks/quelquechose" }),
      hook(),
    ]);

    expect(verdict).toMatchObject({ healthy: true, active: 1 });
  });
});
