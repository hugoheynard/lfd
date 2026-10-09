import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import { ContactMessage, type ContactMessageReception } from "../contact-message.js";
import { ContactMessageHandledEvent } from "../contact-message.events.js";
import {
  ContactMessageAlreadyHandledError,
  ContactMessageIncompleteError,
  ContactTextTooLongError,
} from "../errors/contact-errors.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const CAMILLE = { staffUserId: "staff_1", name: "Camille Durand", role: "admin" };

const RECEPTION: ContactMessageReception = {
  id: "m1",
  subject: { id: "s1", labelFr: "Devenir client pro", priority: "low" },
  audience: "b2b",
  author: { name: " Jean Martin ", email: "Jean@Exemple.fr", phone: "" },
  body: " Bonjour, je voudrais un tarif. ",
  userId: null,
  companyId: null,
  at: AT,
};

describe("ContactMessage — un message « Nous écrire »", () => {
  it("se reçoit rogné, l'adresse normalisée, à traiter", () => {
    const state = ContactMessage.receive(RECEPTION).toPersistence();
    expect(state.author).toEqual({ name: "Jean Martin", email: "jean@exemple.fr", phone: "" });
    expect(state.body).toBe("Bonjour, je voudrais un tarif.");
    expect(state.subjectLabel).toBe("Devenir client pro");
    expect(state.priority).toBe("low");
    expect(state.handling).toBeNull();
  });

  it("refuse un message sans nom ou sans texte", () => {
    expect(() =>
      ContactMessage.receive({ ...RECEPTION, author: { ...RECEPTION.author, name: "  " } }),
    ).toThrow(ContactMessageIncompleteError);
    expect(() => ContactMessage.receive({ ...RECEPTION, body: "" })).toThrow(
      ContactMessageIncompleteError,
    );
  });

  it("refuse une adresse invalide, et un texte trop long", () => {
    expect(() =>
      ContactMessage.receive({ ...RECEPTION, author: { ...RECEPTION.author, email: "jean" } }),
    ).toThrow(InvalidEmailError);
    expect(() => ContactMessage.receive({ ...RECEPTION, body: "x".repeat(4001) })).toThrow(
      ContactTextTooLongError,
    );
  });

  it("se marque traité une fois, avec son auteur et son instant", () => {
    const message = ContactMessage.receive(RECEPTION);
    message.markHandled(CAMILLE, LATER);
    expect(message.toPersistence().handling).toEqual({ at: LATER, by: CAMILLE });
  });

  it("refuse un second traitement, en nommant qui l'a déjà fait", () => {
    const message = ContactMessage.receive(RECEPTION);
    message.markHandled(CAMILLE, LATER);
    expect(() => message.markHandled({ ...CAMILLE, name: "Autre" }, LATER)).toThrow(
      ContactMessageAlreadyHandledError,
    );
    expect(() => message.markHandled(CAMILLE, LATER)).toThrow(/Camille Durand/u);
  });

  it("le fait du traitement nomme l'objet, jamais l'auteur", () => {
    const fact = new ContactMessageHandledEvent(ContactMessage.receive(RECEPTION)).journalFact();
    expect(fact).toEqual({
      type: "contact_message.handled",
      subjectType: "contact_message",
      subjectId: "m1",
      payload: { subjectLabel: "Devenir client pro" },
    });
  });
});
