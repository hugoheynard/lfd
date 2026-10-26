# La porte axe de la boutique

Décidée par Hugo le 2026-10-26 : un contrôle d'accessibilité **automatique**, en CI, pour que la
boutique (`apps/lfc-ecommerce-frontend`) ne régresse plus sur ce qu'une machine sait voir. Elle
**verrouille** ; elle ne remplace pas l'audit humain de la
[grille RGAA](grille-audit-rgaa.md).

## Ce qu'elle fait

```bash
pnpm a11y:axe        # la porte : mesure, puis compare à la référence
pnpm a11y:baseline   # régénère la référence (dev-toolbox/accessibilite/axe-baseline.json)
```

1. Playwright sert l'**aperçu** de la boutique (`preview/`, `ng serve lfc-ecommerce-preview`
   sur le port 4318) : la vraie boutique, démarrée sur le backend simulé dans la page
   (`preview/app/composition/demo-routes.ts`) — déterministe, sans réseau, sans compte.
2. L'aperçu ne démarre la boutique que s'il est ouvert par le back-office. La spec
   (`a11y/shop-scenes.a11y.spec.ts`) simule donc l'éditeur : une page servie par `page.route`
   à l'origine de dev du back-office (`http://127.0.0.1:7317`), qui ouvre l'aperçu dans une
   fenêtre et lui envoie `show`, exactement comme la fenêtre détachée.
3. Chaque scène est analysée par axe-core (`@axe-core/playwright`) sur les règles `wcag2a`,
   `wcag2aa`, `wcag21aa`, `wcag22aa`, à **1280 px et 320 px**. L'horloge du navigateur est
   gelée (fuseau `Europe/Paris`) : les jours et créneaux de la démonstration en dépendent, et
   un nombre de créneaux qui varierait avec l'heure ferait varier les comptes.
4. `dev-toolbox/accessibilite/axe-gate.mjs` compare le nombre de **nœuds en violation par
   page et par règle** à la référence.

## La dette comptée

Comme `lint:code-language` ou `lint:controller-buses`, la référence ne peut que décroître.
La porte échoue :

- sur une violation **nouvelle** ou un compte **en hausse** — à corriger, la référence ne
  s'élargit pas ;
- sur un compte **en baisse** ou une règle disparue tant que la référence n'est pas
  régénérée — ce qu'on a remboursé ne doit pas pouvoir revenir en silence ;
- sur une page inscrite non mesurée, ou une page mesurée non inscrite (scène ajoutée ou
  retirée) ;
- sur toute scène qui n'a pas pu être mesurée (aperçu qui ne démarre pas, geste introuvable) :
  une page non mesurée n'est pas une page propre.

Après une correction : `pnpm a11y:baseline`, relire le diff de la référence (il ne doit que
descendre), et le committer avec la correction.

## Ce qu'elle couvre

Toutes les scènes de l'aperçu, lues dans le contrat (`shopCopyPreviewStepsOf`) : une scène
ajoutée à l'aperçu entre d'office dans la porte. Plus cinq gestes (`a11y/extra-scenes.ts`).

| Page (`clientèle/étape[+geste]`)                      | Grille RGAA |
| ----------------------------------------------------- | ----------- |
| `*/welcome`                                           | P01         |
| `*/routing`, `*/time`, `*/shop`                       | P02, P04    |
| `visitor/shop+product-sheet`                          | P03         |
| `*/cart` (dont l'identité invité de `visitor/cart`)   | P04         |
| `*/payment` (élément Stripe simulé)                   | P05         |
| `*/confirmation`                                      | P06         |
| `personal/orders`, `pro/orders`                       | P07         |
| `pro/account`, `personal/loyalty`                     | P10         |
| `visitor/welcome+legal-terms`, `+legal-accessibility` | P12         |
| `visitor/welcome+sign-in` (dialogue de connexion)     | P11         |
| `personal/orders+profile` (le profil)                 | —           |

Durée mesurée le 2026-10-26 : environ 55 s en local pour 54 pages (serveur de dev compris).

## Ce qu'elle ne couvre pas

- **Les critères qu'axe ne sait pas juger** — environ 60 à 70 % du RGAA : pertinence d'une
  alternative, ordre de lecture, restitution par un lecteur d'écran, navigation clavier
  complète. C'est la grille qui les tient.
- **Les cas `incomplete` d'axe** (contraste sur image, par exemple) : seuls les `violations`
  sont comptés.
- **Les pages hors aperçu** : annulation invité (P08), QR de retrait (P09), le détail d'une
  commande, la vraie iframe Stripe. Les trois premières demandent une commande passée, que le jeu
  de démonstration n'a pas (« Mes commandes » y est vide) ; l'annulation invité demande en plus
  une route à jeton. La connexion (P11) et le profil y sont entrés le 2026-10-26 (lot A5) — la
  section « méthodes de connexion » du profil y est mesurée dans son état d'échec, faute de jeton.
- **Les gestes passent par Alt+clic** : un clic nu sur un texte de la boutique ouvre l'édition en
  place de l'aperçu ; Alt le laisse passer.
- **Les dialogues légaux à 320 px** : le pied de page n'existe qu'au-delà de 900 px, les
  mentions s'y ouvrent par le menu, chemin que la porte ne suit pas encore.
- **La langue** : seule `fr` est analysée.

## En CI

Job `front-platform-a11y` de `.github/workflows/ci.yml`, lancé quand la boutique est dans le
périmètre ; il installe Chromium et compte dans `ci-gate`. Il n'est pas dans le `pre-push`,
trop lent pour un hook, comme les autres tests navigateur.
