/**
 * Les primitives de rendu partagées par tous les gabarits : échapper, assainir
 * un objet d'e-mail, et poser la coquille commune.
 *
 * Elles vivent ici et pas dans les apps parce que ce sont exactement les trois
 * choses qu'on écrit de travers quand on les réécrit : un échappement partiel,
 * un objet d'e-mail qui laisse passer un retour à la ligne, une mise en page qui
 * dérive d'un e-mail à l'autre.
 */

/**
 * Échappement HTML minimal pour tout texte interpolé dans un gabarit.
 *
 * **Portée** : nœuds de texte et valeurs d'attributs **entre guillemets**. Ne
 * pas s'en servir pour un attribut non quoté, une chaîne JS ou du CSS — ces
 * contextes ont leurs propres règles.
 */
export function htmlEscape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/**
 * Assainit une chaîne destinée à l'en-tête `Subject:`.
 *
 * L'objet n'est **pas** du HTML (donc on ne l'échappe pas) mais c'est **un
 * en-tête** : tout caractère de contrôle — au premier chef CR/LF — doit
 * disparaître, sinon une donnée saisie par un utilisateur permet d'injecter des
 * en-têtes. La boucle sur les codes évite une expression régulière de
 * caractères de contrôle (et donc un `eslint-disable`).
 */
export function sanitiseSubject(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/gu, " ").trim();
}

/**
 * N'affiche un bouton que pour un lien `http(s)` ou une racine — jamais
 * `javascript:`, `data:` ou un autre schéma. Défense en profondeur : ces liens
 * sont inertes dans un client mail, mais on n'émet pas de lien hostile.
 */
function isRenderableUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/");
}

/** L'appel à l'action d'un e-mail : un libellé, un lien. */
export interface MailCta {
  readonly label: string;
  readonly url: string;
}

export interface LayoutInput {
  readonly title: string;
  /** Le corps, en texte brut. Les retours à la ligne sont préservés. */
  readonly body: string;
  readonly cta?: MailCta;
  /** La ligne de pied — mentions, désinscription. Texte brut. */
  readonly footer?: string;
  /**
   * L'adresse de recours, affichée en bas : « un problème ? écrivez ici ».
   *
   * Elle n'a de valeur que si elle ne peut pas devenir fausse — d'où l'usage de
   * l'**admin racine**, la seule adresse que le domaine protège de toute
   * suppression, rétrogradation ou renommage. Une adresse de support qui
   * disparaît est pire que pas d'adresse : elle envoie quelqu'un attendre.
   */
  readonly supportEmail?: string;
  /**
   * Le bandeau de marque. Absent, l'e-mail garde la coquille sans en-tête —
   * utile pour les messages purement techniques, qui n'ont personne à rassurer.
   */
  readonly brand?: string;
}

/**
 * La charte de la suite, telle qu'elle est **déjà** à l'écran : le thème `navi`
 * du back-office — marine corporate, page ivoire, angles quasi carrés.
 *
 * Les valeurs sont écrites en dur, et c'est voulu : un e-mail n'a pas de
 * feuille de styles, pas de variables CSS, pas de thème à l'exécution. Les
 * reprendre ici est la seule façon d'avoir la même identité des deux côtés —
 * au prix d'un rappel à faire si la marque change, ce que ce commentaire porte.
 */
const BRAND = {
  navy: "#24448f",
  navyDeep: "#1a3157",
  ivory: "#fdfcfb",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  radius: "4px",
} as const;

/**
 * La **coquille commune** : un seul gabarit visuel pour toute la suite, pour
 * qu'un e-mail transactionnel n'ait à décider que de ses mots.
 *
 * CSS en ligne uniquement (Gmail retire les `<style>`), aucune image, aucune
 * police externe — les trois contraintes qui font qu'un e-mail s'affiche partout.
 * **Tout est échappé ici** : un gabarit appelant n'a jamais à y penser.
 */
export function renderLayout(input: LayoutInput): string {
  const cta =
    input.cta !== undefined && isRenderableUrl(input.cta.url)
      ? `<p style="margin:28px 0 4px;"><a href="${htmlEscape(input.cta.url)}" style="display:inline-block;padding:13px 22px;background:${BRAND.navy};color:#ffffff;text-decoration:none;border-radius:${BRAND.radius};font-weight:600;font-size:15px;">${htmlEscape(input.cta.label)}</a></p>`
      : "";
  const footer =
    input.footer === undefined
      ? ""
      : `<p style="margin:24px 0 0;line-height:1.5;font-size:13px;color:${BRAND.muted};">${htmlEscape(input.footer)}</p>`;

  // Le recours est SOUS un filet, séparé du message : il ne se lit pas au même
  // moment. On ne le cherche qu'une fois que quelque chose a mal tourné, et il
  // doit alors se trouver sans relire l'e-mail.
  const support =
    input.supportEmail === undefined || input.supportEmail.trim() === ""
      ? ""
      : `<tr><td style="padding:0 32px 28px;">
          <hr style="border:0;border-top:1px solid ${BRAND.border};margin:0 0 16px;" />
          <p style="margin:0;line-height:1.5;font-size:13px;color:${BRAND.muted};">
            Un problème, ou vous n'attendiez pas ce message&nbsp;? Contactez votre administrateur&nbsp;:
            <a href="mailto:${htmlEscape(input.supportEmail)}" style="color:${BRAND.navy};font-weight:600;text-decoration:none;">${htmlEscape(input.supportEmail)}</a>
          </p>
        </td></tr>`;

  const header =
    input.brand === undefined
      ? ""
      : `<tr><td style="background:${BRAND.navyDeep};padding:18px 32px;border-radius:${BRAND.radius} ${BRAND.radius} 0 0;">
          <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${htmlEscape(input.brand)}</span>
        </td></tr>`;

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND.ink};background:${BRAND.ivory};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND.border};border-radius:${BRAND.radius};">
      ${header}
      <tr><td style="padding:32px 32px 8px;">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.ink};">${htmlEscape(input.title)}</h1>
        <p style="margin:0;line-height:1.6;white-space:pre-line;">${htmlEscape(input.body)}</p>
        ${cta}
        ${footer}
      </td></tr>
      ${support}
    </table>
  </body>
</html>`;
}
