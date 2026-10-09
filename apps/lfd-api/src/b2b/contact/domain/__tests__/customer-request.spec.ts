import { CustomerRequest } from "../customer-request.js";
import {
  ContactTextTooLongError,
  CustomerRequestAlreadyHandledError,
  CustomerRequestIncompleteError,
  RequestClosedToPhotosError,
  RequestPhotosNotAllowedError,
  TooManyRequestPhotosError,
} from "../errors/contact-errors.js";
import { CustomerRequestHandledEvent } from "../customer-request.events.js";
import {
  AT,
  contactRequest,
  LATER,
  ORDER,
  orderProblem,
  photo,
  RECEPTION,
} from "./request-fixtures.js";

const STAFF = { staffUserId: "staff_1", name: "Camille Durand", role: "admin" };

describe("CustomerRequest.contact — « Nous écrire »", () => {
  it("reçoit une demande `contact`, rognée, sans détail de commande", () => {
    const request = contactRequest({ body: "  Bonjour  " });
    expect(request.kind).toBe("contact");
    expect(request.details).toEqual({ kind: "contact" });
    expect(request.toPersistence()).toMatchObject({ body: "Bonjour", handling: null });
  });

  it("refuse une demande sans nom ou sans texte", () => {
    expect(() => contactRequest({ author: { ...RECEPTION.author, name: " " } })).toThrow(
      CustomerRequestIncompleteError,
    );
    expect(() => contactRequest({ body: "  " })).toThrow(CustomerRequestIncompleteError);
  });

  it("refuse un texte trop long", () => {
    expect(() => contactRequest({ body: "x".repeat(4001) })).toThrow(ContactTextTooLongError);
  });

  it("n'admet AUCUNE photo : le type ne le permet pas", () => {
    expect(() => contactRequest().attachPhoto("p1", photo(), AT)).toThrow(
      RequestPhotosNotAllowedError,
    );
  });
});

describe("CustomerRequest.orderProblem — « Signaler un problème »", () => {
  it("porte la commande, et accepte un signalement sans mot", () => {
    const request = orderProblem({ body: "" });
    expect(request.details).toEqual({ kind: "order_problem", order: ORDER, photos: [] });
    expect(request.toPersistence().body).toBe("");
  });

  it("joint des photos par rang, sous une clé dérivée de la demande", () => {
    const request = orderProblem();
    const first = request.attachPhoto("p1", photo(), AT);
    const second = request.attachPhoto("p2", photo(), AT);
    expect(first).toMatchObject({
      position: 0,
      storageKey: "requests/q1/p1",
      contentType: "image/png",
    });
    expect(second.position).toBe(1);
  });

  it("refuse une quatrième photo", () => {
    const request = orderProblem();
    for (const id of ["p1", "p2", "p3"]) {
      request.attachPhoto(id, photo(), AT);
    }
    expect(() => request.attachPhoto("p4", photo(), AT)).toThrow(TooManyRequestPhotosError);
  });

  it("refuse une photo après traitement", () => {
    const request = orderProblem();
    request.markHandled(STAFF, LATER);
    expect(() => request.attachPhoto("p1", photo(), LATER)).toThrow(RequestClosedToPhotosError);
  });
});

describe("CustomerRequest.markHandled", () => {
  it("se traite une fois ; la seconde nomme qui l'a déjà fait", () => {
    const request = contactRequest();
    request.markHandled(STAFF, LATER);
    expect(request.toPersistence().handling).toEqual({ at: LATER, by: STAFF });
    expect(() => request.markHandled({ ...STAFF, name: "Léa" }, LATER)).toThrow(
      /déjà traitée par Camille Durand/u,
    );
    expect(() => request.markHandled(STAFF, LATER)).toThrow(CustomerRequestAlreadyHandledError);
  });

  it("le fait journalisé porte le motif et le type, jamais l'auteur", () => {
    const fact = new CustomerRequestHandledEvent(orderProblem()).journalFact();
    expect(fact).toEqual({
      type: "customer_request.handled",
      subjectType: "customer_request",
      subjectId: "q1",
      payload: { subjectLabel: "Produit abîmé", kind: "order_problem" },
    });
    expect(JSON.stringify(fact)).not.toMatch(/Jean|exemple\.fr/u);
  });
});

describe("CustomerRequest.anonymize — la purge à douze mois", () => {
  it("vide l'auteur, le texte, les rattachements, la commande ; rend les photos à supprimer", () => {
    const request = orderProblem({ companyId: "c1" });
    request.attachPhoto("p1", photo(), AT);
    request.attachPhoto("p2", photo(), AT);

    expect(request.anonymize(LATER)).toEqual(["requests/q1/p1", "requests/q1/p2"]);

    const state = request.toPersistence();
    expect(state).toMatchObject({
      author: { name: "", email: "", phone: "" },
      body: "",
      userId: null,
      companyId: null,
      anonymizedAt: LATER,
      details: { kind: "order_problem", order: null },
    });
    // Les lignes restent, vidées : une purge réglementaire, pas un DELETE.
    expect(state.details).toMatchObject({
      photos: [
        { id: "p1", storageKey: "", contentType: "", sizeBytes: 0, purgedAt: LATER },
        { id: "p2", storageKey: "", purgedAt: LATER },
      ],
    });
  });

  it("est idempotente : une seconde passe ne rend rien et ne change pas la date", () => {
    const request = orderProblem();
    request.attachPhoto("p1", photo(), AT);
    request.anonymize(AT);
    expect(request.anonymize(LATER)).toEqual([]);
    expect(request.toPersistence().anonymizedAt).toEqual(AT);
  });

  it("une demande `contact` n'a rien à purger au stockage", () => {
    const request = contactRequest();
    expect(request.anonymize(LATER)).toEqual([]);
    expect(request.details).toEqual({ kind: "contact" });
  });

  it("une demande anonymisée se réhydrate sans revalider ses champs vides", () => {
    const request = contactRequest();
    request.anonymize(LATER);
    expect(CustomerRequest.rehydrate(request.toPersistence()).author.name).toBe("");
  });
});
