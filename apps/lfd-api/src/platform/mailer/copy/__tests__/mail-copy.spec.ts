import { contentLocales } from "@lfd/contracts";

import { b2bMailTemplates } from "../../mail-templates.js";
import { fill, fillNamed, MAIL_COPY, mailCopyOf } from "../mail-copy.js";
import { MAIL_COPY_VARIABLES } from "../mail-copy.variables.js";

/**
 * Le type garantit qu'aucune **clé** ne manque : `MailCopyBook` est un `Record`
 * sur les trois langues, et une phrase ajoutée au modèle rend les trois fichiers
 * incomplets d'un coup. Il ne garantit rien sur ce qu'il y a **dedans**.
 *
 * Ces cas couvrent l'autre moitié : une phrase vide, ou une traduction qui a
 * laissé tomber un trou d'interpolation. Les deux compilent, les deux partent, et
 * aucune ne lève — la seconde produit un objet d'e-mail où le numéro de commande
 * manque, dans une seule langue.
 */

/** Toutes les feuilles de l'arbre, chemin compris — de quoi nommer le fautif. */
function leaves(value: unknown, path = ""): readonly (readonly [string, string])[] {
  if (typeof value === "string") {
    return [[path, value]];
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path === "" ? key : `${path}.${key}`),
  );
}

/** Les trous d'interpolation d'une phrase, triés — `{ref}`, `{count}`… */
function placeholders(text: string): readonly string[] {
  return [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1] ?? "").sort();
}

describe("le dictionnaire des e-mails", () => {
  it("couvre les trois langues de la vitrine, sans en inventer une quatrième", () => {
    expect(Object.keys(MAIL_COPY).sort()).toEqual([...contentLocales].sort());
  });

  it.each([...contentLocales])("n'a aucune phrase vide en %s", (locale) => {
    const empty = leaves(mailCopyOf(locale)).filter(([, text]) => text.trim() === "");

    expect(empty).toEqual([]);
  });

  it("garde les MÊMES trous d'interpolation dans les trois langues", () => {
    // Le cas que le type ne voit pas : un traducteur qui écrit « Votre commande
    // est confirmée » au lieu de « Votre commande {ref} est confirmée ». Ça
    // compile, ça part, et l'objet de l'e-mail perd son numéro — dans une seule
    // langue, donc chez les seuls clients qu'on relit le moins.
    const reference = new Map(leaves(mailCopyOf("fr")));

    for (const locale of contentLocales) {
      for (const [path, text] of leaves(mailCopyOf(locale))) {
        expect([locale, path, placeholders(text)]).toEqual([
          locale,
          path,
          placeholders(reference.get(path) ?? ""),
        ]);
      }
    }
  });

  it("a exactement les mêmes chemins dans les trois langues", () => {
    const paths = (locale: (typeof contentLocales)[number]): readonly string[] =>
      leaves(mailCopyOf(locale))
        .map(([path]) => path)
        .sort();

    for (const locale of contentLocales) {
      expect(paths(locale)).toEqual(paths("fr"));
    }
  });
});

describe("le dictionnaire, rangé par e-mail (E1)", () => {
  const registryKeys = Object.keys(
    b2bMailTemplates({ supportEmail: "admin@lfc.test", backOfficeUrl: "" }),
  ).sort();

  it("a une section par clé du registre, et aucune autre", () => {
    // Une section orpheline serait un texte que l'écran proposerait d'éditer
    // pour un e-mail qui ne part plus ; une clé sans section, un e-mail dont
    // le texte serait resté dans son gabarit.
    expect(Object.keys(mailCopyOf("fr")).sort()).toEqual(registryKeys);
    expect(Object.keys(MAIL_COPY_VARIABLES).sort()).toEqual(registryKeys);
  });

  it.each([...contentLocales])(
    "n'emploie en %s que des variables que le gabarit fournit",
    (locale) => {
      // Une variable inconnue part telle quelle chez le client : « {refe} ».
      const unknown = Object.entries(mailCopyOf(locale)).flatMap(([key, section]) => {
        const allowed = MAIL_COPY_VARIABLES[key as keyof typeof MAIL_COPY_VARIABLES];
        return leaves(section)
          .flatMap(([path, text]) => placeholders(text).map((name) => [key, path, name]))
          .filter(([, path, name]) => !(allowed[path ?? ""] ?? []).includes(name ?? ""));
      });

      expect(unknown).toEqual([]);
    },
  );

  it("ne déclare de variables que pour des textes qui existent", () => {
    const paths = new Map(
      Object.entries(mailCopyOf("fr")).map(([key, section]) => [
        key,
        new Set(leaves(section).map(([path]) => path)),
      ]),
    );
    const stale = Object.entries(MAIL_COPY_VARIABLES).flatMap(([key, declared]) =>
      Object.keys(declared)
        .filter((path) => !(paths.get(key)?.has(path) ?? false))
        .map((path) => `${key} › ${path}`),
    );

    expect(stale).toEqual([]);
  });
});

describe("l'interpolation", () => {
  it("remplace la clé par sa valeur", () => {
    expect(fill("Votre commande {ref}", { ref: "ORD-42" })).toBe("Votre commande ORD-42");
  });

  it("laisse le trou VISIBLE quand la valeur manque", () => {
    // Plutôt qu'une chaîne vide : « Votre commande  » se lit comme une phrase
    // finie et personne ne remarque le trou, alors que « {ref} » saute aux yeux
    // dès le premier envoi de contrôle.
    expect(fill("Votre commande {ref}", {})).toBe("Votre commande {ref}");
  });

  it("prend la forme sans prénom quand il est vide", () => {
    expect(fillNamed("Bonjour, {firstName}", "Bonjour", "Paul")).toBe("Bonjour, Paul");
    expect(fillNamed("Bonjour, {firstName}", "Bonjour", "")).toBe("Bonjour");
  });

  it("n'interprète rien d'autre qu'une clé simple", () => {
    // Volontairement minimal : une interpolation qui accepte des expressions
    // finirait par en accepter une venue d'une saisie utilisateur.
    expect(fill("Total {a.b} et {  x }", { "a.b": "non" })).toBe("Total {a.b} et {  x }");
  });
});
