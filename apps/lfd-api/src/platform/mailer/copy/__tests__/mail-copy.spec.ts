import { contentLocales } from "@lfd/contracts";

import { fill, MAIL_COPY, mailCopyOf } from "../mail-copy.js";

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

  it("n'interprète rien d'autre qu'une clé simple", () => {
    // Volontairement minimal : une interpolation qui accepte des expressions
    // finirait par en accepter une venue d'une saisie utilisateur.
    expect(fill("Total {a.b} et {  x }", { "a.b": "non" })).toBe("Total {a.b} et {  x }");
  });
});
