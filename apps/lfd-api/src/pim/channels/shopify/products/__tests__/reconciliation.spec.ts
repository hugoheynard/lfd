import type { ShopifyProductSnapshot } from "@lfd/shopify-admin";

import type { ShopifyProductPayload } from "../projection.js";
import {
  comparableFromPayload,
  comparableFromRemote,
  comparableHash,
  diffComparable,
  statusFor,
  type RemoteVerdict,
} from "../reconciliation.js";

function payload(overrides: Partial<ShopifyProductPayload> = {}): ShopifyProductPayload {
  return {
    title: "Croissant",
    handle: "croissant",
    status: "ACTIVE",
    variants: [
      {
        sku: "PATI-CROISSANT",
        title: "Nature",
        options: { taille: "unité" },
        price: "1.30",
      },
    ],
    ...overrides,
  };
}

function remote(overrides: Partial<ShopifyProductSnapshot> = {}): ShopifyProductSnapshot {
  return {
    id: "gid://shopify/Product/1",
    handle: "croissant",
    title: "Croissant",
    status: "ACTIVE",
    variants: [{ sku: "PATI-CROISSANT", title: "Nature", price: "1.30" }],
    ...overrides,
  };
}

describe("comparable (dénominateur commun)", () => {
  it("laisse tomber les options d’OURS (Shopify ne les rend pas en lecture)", () => {
    const comparable = comparableFromPayload(payload());
    expect(comparable.variants[0]).not.toHaveProperty("options");
    expect(comparable.variants[0]?.sku).toBe("PATI-CROISSANT");
  });

  it("une même fiche OURS et THEIRS produit la même empreinte comparable", () => {
    expect(comparableHash(comparableFromPayload(payload()))).toBe(
      comparableHash(comparableFromRemote(remote())),
    );
  });

  it("un prix changé en boutique casse l’empreinte comparable", () => {
    const drifted = comparableFromRemote(
      remote({
        variants: [{ sku: "PATI-CROISSANT", title: "Nature", price: "9.99" }],
      }),
    );
    expect(comparableHash(drifted)).not.toBe(comparableHash(comparableFromPayload(payload())));
  });

  it("un titre de déclinaison renommé par Shopify (« Default Title ») NE dérive PAS", () => {
    // Le cas vérifié live : Shopify renomme la déclinaison d'un produit mono-variante.
    // SKU et prix identiques ⇒ pas de dérive distante.
    const shopifyRenamed = comparableFromRemote(
      remote({
        variants: [{ sku: "PATI-CROISSANT", title: "Default Title", price: "1.30" }],
      }),
    );
    expect(comparableHash(shopifyRenamed)).toBe(comparableHash(comparableFromPayload(payload())));
  });

  it("un statut passé en DRAFT côté boutique casse l’empreinte", () => {
    expect(comparableHash(comparableFromRemote(remote({ status: "DRAFT" })))).not.toBe(
      comparableHash(comparableFromPayload(payload())),
    );
  });

  it("un changement d’option SEUL ne change pas l’empreinte comparable", () => {
    // Attendu : la dérive distante ne peut pas voir les options ; c’est la dérive
    // LOCALE (empreinte pleine) qui l’attrape, ailleurs.
    const a = comparableHash(comparableFromPayload(payload()));
    const b = comparableHash(
      comparableFromPayload(
        payload({
          variants: [
            {
              sku: "PATI-CROISSANT",
              title: "Nature",
              options: { taille: "XL" },
              price: "1.30",
            },
          ],
        }),
      ),
    );
    expect(a).toBe(b);
  });
});

describe("statusFor (table de vérité §3)", () => {
  const base = (over: Partial<Parameters<typeof statusFor>[0]>) =>
    statusFor({
      hasOurs: true,
      hasBase: true,
      localAhead: false,
      remote: "aligned",
      ...over,
    });

  it("never_published sans BASE", () => {
    expect(base({ hasBase: false })).toBe("never_published");
  });
  it("to_remove sans OURS", () => {
    expect(base({ hasOurs: false })).toBe("to_remove");
  });
  it("up_to_date quand tout est aligné", () => {
    expect(base({})).toBe("up_to_date");
  });
  it("local_ahead quand seul OURS a bougé", () => {
    expect(base({ localAhead: true })).toBe("local_ahead");
  });
  it("remote_drift quand seule la boutique a bougé", () => {
    expect(base({ remote: "drift" })).toBe("remote_drift");
  });
  it("conflict quand les deux ont bougé", () => {
    expect(base({ localAhead: true, remote: "drift" })).toBe("conflict");
  });

  it("unknown ≠ dérive : boutique illisible + pas de changement local", () => {
    const r: RemoteVerdict = "unknown";
    expect(base({ remote: r })).toBe("unknown");
  });
  it("reste local_ahead si local a bougé même quand la boutique est illisible", () => {
    expect(base({ localAhead: true, remote: "unknown" })).toBe("local_ahead");
  });
});

describe("diffComparable", () => {
  it("liste titre, statut et déclinaisons qui diffèrent", () => {
    const before = comparableFromPayload(payload());
    const after = comparableFromPayload(payload({ title: "Croissant beurre", status: "DRAFT" }));
    const diffs = diffComparable(before, after);
    const fields = diffs.map((d) => d.field);
    expect(fields).toContain("Titre");
    expect(fields).toContain("Statut");
  });

  it("aucun diff entre deux formes identiques", () => {
    expect(
      diffComparable(comparableFromPayload(payload()), comparableFromPayload(payload())),
    ).toHaveLength(0);
  });
});
