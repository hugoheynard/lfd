import {
  CARD_ACCOUNTS,
  DeclaredCardAccountDefaults,
  UNNAMED_WEBHOOK_ACCOUNT,
  declaredCardAccount,
} from "../card-accounts.js";

describe("le registre des comptes d'encaissement", () => {
  it("`lfc-stripe` pointe sur les trois variables d'avant le registre", () => {
    expect(declaredCardAccount("lfc-stripe")).toEqual({
      name: "lfc-stripe",
      provider: "stripe",
      prefix: "STRIPE",
      env: {
        secretKey: "STRIPE_SECRET_KEY",
        publishableKey: "STRIPE_PUBLISHABLE_KEY",
        webhookSecret: "STRIPE_WEBHOOK_SECRET",
      },
    });
  });

  it("chaque nom est unique, et chaque variable porte le préfixe de son compte", () => {
    const names = CARD_ACCOUNTS.map((account) => account.name);
    expect(new Set(names).size).toBe(names.length);
    for (const account of CARD_ACCOUNTS) {
      const { secretKey, publishableKey, webhookSecret } = account.env;
      for (const variable of [secretKey, publishableKey, webhookSecret]) {
        expect(variable.startsWith(`${account.prefix}_`)).toBe(true);
      }
    }
  });

  it("le webhook sans compte désigne un compte du registre", () => {
    expect(declaredCardAccount(UNNAMED_WEBHOOK_ACCOUNT)).not.toBeNull();
  });

  it("ne connaît pas un compte absent", () => {
    expect(declaredCardAccount("lfc-caisse-epargne")).toBeNull();
  });
});

describe("DeclaredCardAccountDefaults", () => {
  const defaults = new DeclaredCardAccountDefaults({ order: "lfc-stripe" });

  it("rend le compte d'un type déclaré", () => {
    expect(defaults.accountFor("order")).toBe("lfc-stripe");
  });

  it.each(["invoice", "toString", "__proto__"])("rend null pour %p", (type) => {
    expect(defaults.accountFor(type)).toBeNull();
  });
});
