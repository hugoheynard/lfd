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
}

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
      ? `<p style="margin:24px 0;"><a href="${htmlEscape(input.cta.url)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${htmlEscape(input.cta.label)}</a></p>`
      : "";
  const footer =
    input.footer === undefined
      ? ""
      : `<p style="margin:24px 0 0;line-height:1.5;font-size:13px;color:#64748b;">${htmlEscape(input.footer)}</p>`;

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;background:#f8fafc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:20px;">${htmlEscape(input.title)}</h1>
        <p style="margin:0 0 16px;line-height:1.5;white-space:pre-line;">${htmlEscape(input.body)}</p>
        ${cta}
        ${footer}
      </td></tr>
    </table>
  </body>
</html>`;
}
