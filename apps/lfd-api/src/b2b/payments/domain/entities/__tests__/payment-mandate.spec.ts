import {
  MandateAcceptanceInFutureError,
  MandateNotProvableError,
  MandateNotRevocableError,
  MandateNotSignableError,
  MandateUnprovenError,
} from "../../errors/mandate-errors.js";
import {
  draftMandate,
  mintMandate,
  PaymentMandate,
  type MandateSnapshot,
  type RegisteredMandate,
} from "../payment-mandate.js";

const NOW = new Date("2026-08-11T10:00:00.000Z");

const REGISTRATION: RegisteredMandate = {
  stripeCustomerId: "cus_1",
  paymentMethodId: "pm_1",
  reference: "RUM-123",
  last4: "3000",
  bankCode: "BNPA",
  country: "FR",
  status: "active",
};

function snapshot(overrides: Partial<MandateSnapshot> = {}): MandateSnapshot {
  return {
    scheme: "B2B",
    paymentType: "recurrent",
    ...REGISTRATION,
    id: "mdt_1",
    companyId: "cmp_1",
    acceptedAt: new Date("2024-03-12T00:00:00.000Z"),
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    creditorId: null,
    ...overrides,
  };
}

describe("draftMandate — la date qu'on opposera", () => {
  it("accepte une signature ANCIENNE", () => {
    // Le cas central : on reprend un portefeuille dont les mandats papier ont
    // deux ans. Exiger une date récente rendrait la reprise impossible.
    const draft = draftMandate({
      companyId: "cmp_1",
      registration: REGISTRATION,
      acceptedAt: new Date("2024-03-12T00:00:00.000Z"),
      now: NOW,
    });

    expect(draft.acceptedAt?.getFullYear()).toBe(2024);
    expect(draft.proofStorageKey).toBeNull();
  });

  it("refuse une signature dans le FUTUR", () => {
    // C'est la date qu'on présentera en contestation : une faute de frappe s'y
    // voit maintenant, ou devant la banque.
    expect(() =>
      draftMandate({
        companyId: "cmp_1",
        registration: REGISTRATION,
        acceptedAt: new Date("2026-08-12T00:00:00.000Z"),
        now: NOW,
      }),
    ).toThrow(MandateAcceptanceInFutureError);
  });

  it("ne porte AUCUNE coordonnée bancaire", () => {
    // Le contrat central du design : ce qu'on écrit ne permet à personne de
    // reconstituer un IBAN.
    const draft = draftMandate({
      companyId: "cmp_1",
      registration: REGISTRATION,
      acceptedAt: NOW,
      now: NOW,
    });

    expect(JSON.stringify(draft)).not.toMatch(/iban/iu);
    expect(draft.last4).toBe("3000");
  });
});

describe("PaymentMandate — prélever, ou ne plus prélever", () => {
  it("n'est débitable qu'ACTIF", () => {
    expect(PaymentMandate.reconstitute(snapshot()).debitable()).toBe(true);
    expect(PaymentMandate.reconstitute(snapshot({ status: "pending" })).debitable()).toBe(false);
    expect(PaymentMandate.reconstitute(snapshot({ status: "revoked" })).debitable()).toBe(false);
  });

  it("révoque en datant, et refuse de révoquer deux fois", () => {
    // La seconde révocation écraserait la date qui fait foi.
    const mandate = PaymentMandate.reconstitute(snapshot());

    mandate.revoke(NOW);

    expect(mandate.status).toBe("revoked");
    expect(mandate.toSnapshot().revokedAt).toEqual(NOW);
    expect(() => mandate.revoke(new Date("2026-09-01T00:00:00.000Z"))).toThrow(
      MandateNotRevocableError,
    );
    expect(mandate.toSnapshot().revokedAt).toEqual(NOW);
  });

  it("distingue le mandat PROUVÉ du mandat nu", () => {
    // Un mandat sans pièce est un mandat sans filet : la fiche doit pouvoir le
    // dire, donc l'agrégat doit pouvoir le distinguer.
    const mandate = PaymentMandate.reconstitute(snapshot({ status: "draft", acceptedAt: null }));
    expect(mandate.proven()).toBe(false);

    mandate.attachProof({ storageKey: "companies/cmp_1/mandates/mdt_1/x", fileName: "mandat.pdf" });

    expect(mandate.proven()).toBe(true);
    expect(mandate.toView().proofFileName).toBe("mandat.pdf");
  });

  /**
   * 🔴 Régression (2026-09-14) : un dépôt sur un mandat ACTIF remplaçait la
   * pièce qu'on oppose en contestation, sans que personne ne la relise.
   */
  it.each(["active", "revoked", "pending", "failed"] as const)(
    "refuse un scan sur un mandat « %s », et garde la pièce en place",
    (status) => {
      const mandate = PaymentMandate.reconstitute(
        snapshot({
          status,
          proofStorageKey: "companies/cmp_1/mandates/mdt_1/v1",
          proofFileName: "v1.pdf",
        }),
      );

      expect(() => {
        mandate.refuseUnlessProvable();
      }).toThrow(MandateNotProvableError);
      expect(() => {
        mandate.attachProof({
          storageKey: "companies/cmp_1/mandates/mdt_1/v2",
          fileName: "v2.pdf",
        });
      }).toThrow(MandateNotProvableError);
      expect(mandate.proofStorageKey()).toBe("companies/cmp_1/mandates/mdt_1/v1");
    },
  );

  it("laisse remplacer le scan d'un brouillon — c'est encore la saisie", () => {
    const mandate = PaymentMandate.reconstitute(
      snapshot({
        status: "draft",
        acceptedAt: null,
        proofStorageKey: "k/v1",
        proofFileName: "v1.pdf",
      }),
    );

    mandate.attachProof({ storageKey: "k/v2", fileName: "v2.pdf" });

    expect(mandate.proofStorageKey()).toBe("k/v2");
  });
});

describe("PaymentMandate — ce qui sort vers l'écran", () => {
  it("ne laisse fuir NI le moyen de paiement NI le client Stripe", () => {
    // Ces deux identifiants servent à débiter. Ce qui ne sort pas ne fuit pas.
    const view = PaymentMandate.reconstitute(snapshot()).toView();

    expect(JSON.stringify(view)).not.toContain("pm_1");
    expect(JSON.stringify(view)).not.toContain("cus_1");
    expect(view.reference).toBe("RUM-123");
  });
});

describe("mintMandate — le mandat qu'on frappe soi-même", () => {
  it("naît SANS date de signature — le consentement n'a pas encore été donné", () => {
    // L'invariant du lot. Poser la date de frappe ici daterait l'autorisation
    // du jour où on l'a DEMANDÉE, et c'est cette date qu'un débiteur conteste.
    const draft = mintMandate({
      scheme: "B2B",
      paymentType: "recurrent",
      companyId: "cmp_1",
      creditorId: "ent_1",
      reference: "LFC-9P2X4B-260912-K7M3QT",
    });

    expect(draft.acceptedAt).toBeNull();
    expect(draft.status).toBe("draft");
  });

  it("ne porte aucun rattachement au prestataire", () => {
    const draft = mintMandate({
      scheme: "B2B",
      paymentType: "recurrent",
      companyId: "cmp_1",
      creditorId: "ent_1",
      reference: "LFC-X",
    });

    expect(draft.stripeCustomerId).toBeNull();
    expect(draft.paymentMethodId).toBeNull();
  });

  it("nomme son émetteur — sans lui, le papier ne peut pas être imprimé", () => {
    const draft = mintMandate({
      scheme: "B2B",
      paymentType: "recurrent",
      companyId: "cmp_1",
      creditorId: "ent_1",
      reference: "LFC-X",
    });

    expect(draft.creditorId).toBe("ent_1");
  });
});

describe("PaymentMandate.sign — le papier revient signé", () => {
  /** Un brouillon PROUVÉ : l'activation l'exige, le brouillon nu a son cas. */
  function draftSnapshot(overrides: Partial<MandateSnapshot> = {}): MandateSnapshot {
    return snapshot({
      status: "draft",
      acceptedAt: null,
      stripeCustomerId: null,
      paymentMethodId: null,
      creditorId: "ent_1",
      proofStorageKey: "companies/cmp_1/mandates/mdt_1/mandat-signe-1",
      proofFileName: "mandat-signe.pdf",
      ...overrides,
    });
  }

  /**
   * 🔴 Depuis le 2026-09-14 : on prouve AVANT d'activer. C'est ce qui permet de
   * refuser le dépôt sur un actif sans laisser d'actif à jamais improuvable.
   */
  it("refuse d'activer un brouillon sans scan, et le laisse brouillon", () => {
    const mandate = PaymentMandate.reconstitute(
      draftSnapshot({ proofStorageKey: null, proofFileName: null }),
    );

    expect(() => {
      mandate.sign(new Date(NOW.getTime() - 86_400_000), NOW);
    }).toThrow(MandateUnprovenError);
    expect(mandate.status).toBe("draft");
    expect(mandate.acceptedAt).toBeNull();
  });

  it("porte la date du PAPIER, pas celle de la saisie", () => {
    const mandate = PaymentMandate.reconstitute(draftSnapshot());
    // Neuf jours avant la saisie : le cas ordinaire, un papier posté. Relative à
    // `NOW` et non écrite en dur — c'est la même constante que la comparaison.
    const onPaper = new Date(NOW.getTime() - 9 * 86_400_000);

    mandate.sign(onPaper, NOW);

    expect(mandate.acceptedAt).toEqual(onPaper);
    expect(mandate.status).toBe("active");
  });

  it("refuse une date à venir — la même faute de frappe que sur le chemin Stripe", () => {
    const mandate = PaymentMandate.reconstitute(draftSnapshot());
    const tomorrow = new Date(NOW.getTime() + 86_400_000);

    expect(() => {
      mandate.sign(tomorrow, NOW);
    }).toThrow(MandateAcceptanceInFutureError);
  });

  it("refuse de signer deux fois — la seconde écraserait la date qui fait foi", () => {
    const mandate = PaymentMandate.reconstitute(snapshot({ status: "active" }));

    expect(() => {
      mandate.sign(new Date(NOW.getTime() - 9 * 86_400_000), NOW);
    }).toThrow(MandateNotSignableError);
  });

  it("refuse de ressusciter un mandat révoqué", () => {
    const mandate = PaymentMandate.reconstitute(snapshot({ status: "revoked" }));

    expect(() => {
      mandate.sign(new Date(NOW.getTime() - 9 * 86_400_000), NOW);
    }).toThrow(MandateNotSignableError);
  });

  it("un brouillon ne prélève pas, et n'est pas signé", () => {
    const mandate = PaymentMandate.reconstitute(draftSnapshot());

    expect(mandate.debitable()).toBe(false);
    expect(mandate.signed()).toBe(false);
  });

  it("se révoque — un brouillon abandonné doit libérer la place du brouillon unique", () => {
    const mandate = PaymentMandate.reconstitute(draftSnapshot());

    mandate.revoke(NOW);

    expect(mandate.status).toBe("revoked");
  });
});

describe("PaymentMandate — ce que la vue dit d'un brouillon", () => {
  it("rend `acceptedAt` à null plutôt qu'une date inventée", () => {
    // Régression : le champ était non nullable dans le contrat, et le front
    // affichait « signé le … ». Un brouillon n'a rien signé.
    const view = PaymentMandate.reconstitute(
      snapshot({ status: "draft", acceptedAt: null }),
    ).toView();

    expect(view.acceptedAt).toBeNull();
    expect(view.status).toBe("draft");
  });
});

describe("toCustomerView — ce que le client voit de son mandat", () => {
  /** Plan mandat client, fin du §9 : six champs, aucun qui dise le compte. */
  it("ne rend ni le compte, ni la date de révocation", () => {
    const view = PaymentMandate.reconstitute(
      snapshot({ proofStorageKey: "k", proofFileName: "scan.pdf" }),
    ).toCustomerView();

    expect(view).toEqual({
      id: "mdt_1",
      reference: "RUM-123",
      status: "active",
      scheme: "B2B",
      hasProof: true,
      proofFileName: "scan.pdf",
      acceptedAt: "2024-03-12T00:00:00.000Z",
    });
  });

  it("dit « aucune pièce » par un nom vide et une date nulle sur un brouillon nu", () => {
    const view = PaymentMandate.reconstitute(
      snapshot({ status: "draft", acceptedAt: null }),
    ).toCustomerView();

    expect(view).toMatchObject({
      status: "draft",
      hasProof: false,
      proofFileName: "",
      acceptedAt: null,
    });
  });

  it("expose la RUM, qui ne bouge jamais", () => {
    expect(PaymentMandate.reconstitute(snapshot()).reference).toBe("RUM-123");
  });
});
