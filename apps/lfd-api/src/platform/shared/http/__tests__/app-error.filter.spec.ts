import { HttpStatus } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { Response } from "express";

import { DomainError } from "../../errors/app-error.js";
import { IdentityProviderUnavailableError } from "../../errors/identity-errors.js";
import { PersistenceError } from "../../errors/persistence-errors.js";
import { AppErrorFilter } from "../app-error.filter.js";

/**
 * Une erreur de domaine **fabriquée pour ce test**, et non empruntée à un
 * domaine réel.
 *
 * Le filtre traduit des CATÉGORIES d'erreur en statuts HTTP ; il n'a aucune
 * raison de connaître un domaine, et le test ne doit donc pas lui en imposer un.
 * Emprunter `InvalidEmailError` à `account/` faisait précisément ça — et faisait
 * dépendre la couche technique d'un contexte métier, ce que la matrice des
 * frontières interdit.
 */
class SampleDomainError extends DomainError {
  constructor() {
    super("sample.domain.refused", "Refus de domaine.");
  }
}

/** Réponse Express factice : capture le statut et le corps JSON. */
interface CapturedResponse {
  readonly response: Response;
  status(): number | null;
  body(): Record<string, unknown> | null;
}

/** Le sous-ensemble de `Response` que le filtre appelle (status + json chaînés). */
interface FakeResponse {
  status(code: number): FakeResponse;
  json(payload: Record<string, unknown>): FakeResponse;
}

function fakeResponse(): CapturedResponse {
  let status: number | null = null;
  let body: Record<string, unknown> | null = null;
  const response: FakeResponse = {
    status(code: number): FakeResponse {
      status = code;
      return response;
    },
    json(payload: Record<string, unknown>): FakeResponse {
      body = payload;
      return response;
    },
  };
  return {
    response: response as unknown as Response,
    status: () => status,
    body: () => body,
  };
}

/** `ArgumentsHost` réduit à ce que le filtre lit : `switchToHttp().getResponse()`. */
function hostFor(response: Response): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe("AppErrorFilter", () => {
  describe("erreur technique (500)", () => {
    it("renvoie un message neutre, sans détail, quand exposeDetail est faux", () => {
      const captured = fakeResponse();
      new AppErrorFilter(false).catch(
        new PersistenceError("colonne secrète absente"),
        hostFor(captured.response),
      );

      expect(captured.status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body()).toEqual({
        code: "persistence.failure",
        message: "Une erreur technique est survenue.",
      });
    });

    it("joint le détail technique quand exposeDetail est vrai — message toujours neutre", () => {
      const captured = fakeResponse();
      new AppErrorFilter(true).catch(
        new PersistenceError("colonne secrète absente"),
        hostFor(captured.response),
      );

      expect(captured.status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body()).toEqual({
        code: "persistence.failure",
        message: "Une erreur technique est survenue.",
        detail: "Échec de persistance : colonne secrète absente",
      });
    });
  });

  describe("erreur inconnue (500)", () => {
    it("masque tout en prod, expose le message en dev", () => {
      const prod = fakeResponse();
      new AppErrorFilter(false).catch(new Error("boom interne"), hostFor(prod.response));
      expect(prod.body()).toEqual({
        code: "internal.unexpected",
        message: "Une erreur technique est survenue.",
      });

      const dev = fakeResponse();
      new AppErrorFilter(true).catch(new Error("boom interne"), hostFor(dev.response));
      expect(dev.body()).toEqual({
        code: "internal.unexpected",
        message: "Une erreur technique est survenue.",
        detail: "boom interne",
      });
    });
  });

  describe("erreur domaine (400)", () => {
    it("passe son message voulu, jamais de détail — même en dev", () => {
      const captured = fakeResponse();
      new AppErrorFilter(true).catch(new SampleDomainError(), hostFor(captured.response));

      expect(captured.status()).toBe(HttpStatus.BAD_REQUEST);
      const body = captured.body();
      expect(body).not.toBeNull();
      expect(body?.["code"]).toBe("sample.domain.refused");
      expect(body).not.toHaveProperty("detail");
    });
  });
});

describe("faits publiables", () => {
  it("publie le statut du fournisseur EN PRODUCTION, sur une erreur technique", () => {
    // Sans lui, un incident ne laisse rien d'exploitable à qui n'a pas accès aux
    // journaux — et le 2026-08-16 ils étaient inatteignables une demi-journée.
    const captured = fakeResponse();
    new AppErrorFilter(false).catch(
      new IdentityProviderUnavailableError("refus", 429),
      hostFor(captured.response),
    );

    expect(captured.body()).toMatchObject({
      code: "identity_provider.unavailable",
      message: "Une erreur technique est survenue.",
      providerStatus: 429,
    });
  });

  it("ne publie rien quand le fournisseur n'a pas répondu", () => {
    const captured = fakeResponse();
    new AppErrorFilter(false).catch(
      new IdentityProviderUnavailableError("canal non configuré"),
      hostFor(captured.response),
    );

    expect(captured.body()).not.toHaveProperty("providerStatus");
  });
});
