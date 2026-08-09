import { appointmentPurposeSchema } from "../appointment.js";
import {
  REQUEST_TOPICS,
  attachmentOf,
  autoAttach,
  classificationIssue,
  familyOf,
  offerableTopics,
  topicsOf,
  type RequestSubject,
} from "../request-topic.js";

const SUBSCRIPTION: RequestSubject = { kind: "subscription", id: "sub_1" };
const OTHER_SUBSCRIPTION: RequestSubject = { kind: "subscription", id: "sub_2" };
const ORDER: RequestSubject = { kind: "order", id: "ord_1" };

describe("la table des types de demande", () => {
  it("couvre toutes les familles — aucune ne reste sans sujet", () => {
    const empty = appointmentPurposeSchema.options.filter(
      (family) => topicsOf(family).length === 0,
    );
    expect(empty).toEqual([]);
  });

  it("range chaque sujet dans la famille que son préfixe annonce", () => {
    // La table fait foi, mais un préfixe qui ment est une erreur de saisie qu'on
    // ne verrait jamais autrement — le sujet se lit tel quel dans un journal.
    const lying = REQUEST_TOPICS.filter((topic) => !topic.startsWith(`${familyOf(topic)}.`));
    expect(lying).toEqual([]);
  });

  it("associe le panier récurrent aux sujets qui portent dessus, et à eux seuls", () => {
    expect(attachmentOf("recurring.frequency")).toBe("subscription");
    expect(attachmentOf("recurring.occurrence")).toBe("subscription_occurrence");
    // Créer un panier n'en désigne aucun : il n'existe pas encore.
    expect(attachmentOf("recurring.create")).toBeNull();
  });
});

describe("la cohérence d'une classification", () => {
  it("accepte un motif seul — le sujet reste facultatif", () => {
    expect(classificationIssue({ purpose: "recurring", topic: null, subject: null })).toBeNull();
  });

  it("refuse un sujet qui n'appartient pas au motif", () => {
    expect(
      classificationIssue({ purpose: "billing", topic: "recurring.frequency", subject: null }),
    ).toMatchObject({ path: "topic" });
  });

  it("refuse un objet désigné sans sujet — rien ne dirait sur quoi il porte", () => {
    expect(
      classificationIssue({ purpose: "recurring", topic: null, subject: SUBSCRIPTION }),
    ).toMatchObject({ path: "subject" });
  });

  it("refuse un objet du mauvais type", () => {
    expect(
      classificationIssue({ purpose: "recurring", topic: "recurring.frequency", subject: ORDER }),
    ).toMatchObject({ path: "subject" });
  });

  it("refuse un objet sur un sujet qui n'en attend aucun", () => {
    expect(
      classificationIssue({
        purpose: "recurring",
        topic: "recurring.create",
        subject: SUBSCRIPTION,
      }),
    ).toMatchObject({ path: "subject" });
  });

  it("accepte l'objet attendu", () => {
    expect(
      classificationIssue({
        purpose: "recurring",
        topic: "recurring.frequency",
        subject: SUBSCRIPTION,
      }),
    ).toBeNull();
  });
});

describe("l'association automatique", () => {
  it("rattache quand il n'y a qu'un seul candidat du bon type", () => {
    expect(autoAttach("recurring.frequency", [SUBSCRIPTION, ORDER])).toEqual(SUBSCRIPTION);
  });

  it("ne devine PAS quand il y en a deux — se tromper s'écrirait dans la fiche", () => {
    expect(autoAttach("recurring.frequency", [SUBSCRIPTION, OTHER_SUBSCRIPTION])).toBeNull();
  });

  it("ne rattache rien à un sujet qui ne porte sur aucun objet", () => {
    expect(autoAttach("recurring.create", [SUBSCRIPTION])).toBeNull();
  });
});

describe("les sujets proposables", () => {
  it("retire ceux qui portent sur un objet que le client n'a pas", () => {
    const offered = offerableTopics("recurring", []);
    expect(offered).toEqual(["recurring.create"]);
  });

  it("rouvre le reste dès qu'un panier existe", () => {
    const offered = offerableTopics("recurring", [SUBSCRIPTION]);
    expect(offered).toContain("recurring.frequency");
    // L'échéance reste hors de portée : elle attend un autre type d'objet.
    expect(offered).not.toContain("recurring.occurrence");
  });

  it("laisse intactes les familles qui ne dépendent d'aucun objet", () => {
    expect(offerableTopics("discover", [])).toEqual(topicsOf("discover"));
  });
});
