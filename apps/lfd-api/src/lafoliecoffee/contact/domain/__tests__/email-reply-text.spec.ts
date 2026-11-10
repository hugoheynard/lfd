import {
  cutQuotedHistory,
  htmlToText,
  oneLine,
  replyTextOf,
  TRUNCATION_MARK,
  truncated,
} from "../email-reply-text.js";

describe("le texte d'une réponse par e-mail", () => {
  describe("cutQuotedHistory — l'historique cité", () => {
    it("coupe à la première ligne citée", () => {
      expect(cutQuotedHistory("Merci !\n\n> Votre commande est prête\n> à 9 h")).toBe("Merci !");
    });

    it.each([
      ["français", "Le lun. 3 nov. 2026 à 10:00, LFC <no-reply@lfc.info> a écrit :"],
      ["anglais", "On Mon, Nov 3, 2026 at 10:00 AM LFC <no-reply@lfc.info> wrote:"],
      ["italien", "Il giorno lun 3 nov 2026 alle 10:00 LFC ha scritto:"],
    ])("coupe à la ligne d'attribution (%s)", (_langue, attribution) => {
      expect(cutQuotedHistory(`Oui, parfait.\n${attribution}\nVotre commande…`)).toBe(
        "Oui, parfait.",
      );
    });

    it("coupe une attribution repliée sur deux lignes", () => {
      const text =
        "D'accord.\r\nLe lun. 3 nov. 2026 à 10:00, La Folie Douce <x@y.fr>\r\na écrit :\r\nBonjour";
      expect(cutQuotedHistory(text)).toBe("D'accord.");
    });

    it("garde un texte sans historique, et une phrase qui commence par « Le »", () => {
      expect(cutQuotedHistory("Le pain était parfait.\nMerci")).toBe(
        "Le pain était parfait.\nMerci",
      );
    });
  });

  describe("truncated — jamais de refus pour la longueur", () => {
    it("laisse un texte dans sa borne", () => {
      expect(truncated("  court  ", 10)).toBe("court");
    });

    it("tronque au-delà, mention comprise dans la borne", () => {
      const long = "a".repeat(50);
      const kept = truncated(long, 30);
      expect(kept.length).toBeLessThanOrEqual(30);
      expect(kept.endsWith(TRUNCATION_MARK)).toBe(true);
    });
  });

  describe("htmlToText — à défaut de partie texte", () => {
    it("rend les paragraphes et sauts de ligne, sans balises ni styles", () => {
      const html =
        "<html><head><style>p{color:red}</style></head><body><p>Bonjour&nbsp;!</p><p>Ligne 2<br>Ligne 3 &amp; fin</p><script>alert(1)</script></body></html>";
      expect(htmlToText(html)).toBe("Bonjour !\nLigne 2\nLigne 3 & fin");
    });

    it("coupe l'historique d'un client HTML (blockquote, gmail_quote)", () => {
      expect(htmlToText("<div>Oui</div><blockquote>Votre commande</blockquote>")).toBe("Oui");
      expect(htmlToText('<div>Non</div><div class="gmail_quote">Le …</div>')).toBe("Non");
    });

    it("décode les entités numériques, et laisse telle quelle une entité impossible", () => {
      expect(htmlToText("&#233;t&#xE9; &#99999999;")).toBe("été &#99999999;");
    });

    it("n'exécute rien : une balise reste du texte retiré, pas un élément", () => {
      expect(htmlToText('<img src=x onerror="alert(1)">Salut')).toBe("Salut");
    });
  });

  it("replyTextOf préfère le texte, puis le HTML, puis rien", () => {
    expect(replyTextOf("texte", "<p>html</p>")).toBe("texte");
    expect(replyTextOf("  ", "<p>html</p>")).toBe("html");
    expect(replyTextOf(null, null)).toBe("");
  });

  it("oneLine ramène un objet à une ligne bornée", () => {
    expect(oneLine("Re:\n  ma   commande ", 8)).toBe("Re: ma c");
  });
});
