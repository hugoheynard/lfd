import { appBaseUrl } from './app-base-url';

describe('appBaseUrl', () => {
  it("rend l'origine nue quand l'app est à la racine", () => {
    // Valeur INCHANGÉE par rapport à `window.location.origin` : les URL déjà
    // déclarées côté Auth0 restent valides, il n'y a rien à migrer.
    expect(appBaseUrl('https://lfc-b2b-eu7.pages.dev/')).toBe('https://lfc-b2b-eu7.pages.dev');
    expect(appBaseUrl('http://localhost:7316/')).toBe('http://localhost:7316');
  });

  it('porte le chemin de déploiement quand il y en a un', () => {
    expect(appBaseUrl('https://lafoliecoffee.info/pro/')).toBe('https://lafoliecoffee.info/pro');
  });

  it('ignore ce qui suit la base — requête, fragment, page courante', () => {
    // `document.baseURI` retombe sur l'URL du document quand aucune balise
    // `<base>` n'existe. La fonction ne doit pas renvoyer la page où l'on se
    // trouve, sinon le callback changerait d'adresse à chaque écran.
    expect(appBaseUrl('https://lafoliecoffee.info/pro/?code=abc#x')).toBe(
      'https://lafoliecoffee.info/pro',
    );
  });
});
