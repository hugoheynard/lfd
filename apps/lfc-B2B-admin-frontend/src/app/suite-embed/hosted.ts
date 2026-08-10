/**
 * « Cette app tourne-t-elle DANS un cadre ? » — la question que se posent deux
 * endroits qui ne peuvent pas se parler.
 *
 * `SuiteEmbed` la pose par injection, au démarrage de l'app. Les **providers**,
 * eux, sont construits AVANT tout contexte d'injection : `app.config.ts` doit
 * décider s'il fournit Auth0 (session propre) ou non (session du shell) sans
 * pouvoir injecter quoi que ce soit. D'où une fonction de module, appelable des
 * deux côtés — plutôt que deux `window.self !== window.top` qui finiraient par
 * diverger.
 */
export function isEmbedded(win: Window | null): boolean {
  return win !== null && win.self !== win.top;
}
