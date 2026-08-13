# Ops — faire tourner LFC en production

Tout ce qui concerne le **déploiement, l'infrastructure et la sécurité d'accès**.
Le reste de `documentation/` décrit le métier ; ici on décrit la machine.

## Par où entrer

| Doc                                                                        | Quand l'ouvrir                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`architecture-deploiement.md`](architecture-deploiement.md)               | « Qu'est-ce qui tourne, et où ? » — la carte, le chemin d'une requête, les containers, les bases |
| [`pipelines.md`](pipelines.md)                                             | « Pourquoi ça s'est déployé (ou pas) ? » — déclencheurs, ordre des étapes, aléas connus          |
| [`secrets-et-variables.md`](secrets-et-variables.md)                       | « Où vit cette valeur ? » — Secret ou Variable, qui la lit, laquelle doit résoudre               |
| [`securite-frontiere-de-confiance.md`](securite-frontiere-de-confiance.md) | « Qu'est-ce qui nous protège vraiment ? » — les trois couches, dont une inerte                   |
| [`runbook.md`](runbook.md)                                                 | « Comment je fais, et comment je sais que ça a marché ? » — les gestes et leurs contrôles        |

Voir aussi, hors de ce dossier :
[`b2b/admin-app-ios-capacitor.md`](../b2b/admin-app-ios-capacitor.md) (l'admin en
app iPhone) et
[`suite/architecture-suite-gateway-scaling.md`](../suite/architecture-suite-gateway-scaling.md)
(le plan d'origine, dont la partie « sous-domaines » attend un domaine).

## Le résumé en dix lignes

- **Une seule porte d'entrée** : le Worker `lfc-suite-gateway`. Les deux backends
  n'ont **aucune adresse publique** ; on les atteint par _service binding_.
- **Routage par préfixe de chemin** (`/api/b2b`, `/api/pim`), retiré avant
  transmission. Le jour où un domaine existera, on repassera aux sous-domaines
  sans toucher aux backends.
- **Containers ancrés en Europe de l'Ouest** (`lhr20`, Londres). Sans contrainte
  explicite, ils atterrissaient au Texas.
- **Le seul rate-limit qui fonctionne est le throttler NestJS.** Celui de l'edge
  Cloudflare est inerte — prouvé, ne pas re-diagnostiquer.
- **Aucune zone Cloudflare**, donc pas de WAF ni de règles de rate limiting.
  C'est le prochain levier structurant.

## Les trois pièges qui reviennent

1. **Un déploiement vert ne prouve pas que la configuration a pris.** Les
   variables ne sont lues qu'au build, et la synchronisation de secrets saute
   silencieusement les valeurs vides. Contrôler dans le bundle servi, pas dans
   le tableau de bord.
2. **Une connexion Prisma est paresseuse.** Le démarrage n'ouvre aucune session :
   une base injoignable ou une chaîne de mauvaise forme ne se manifeste qu'à la
   première vraie requête.
3. **Mesurer trop tôt fait conclure à un échec.** Propagation des routes,
   démarrage à froid des containers : attendre avant de diagnostiquer.

## Ce qui reste ouvert

- La **passerelle n'est couverte par aucun job de CI**, alors que tout le trafic
  la traverse. Trou le plus voyant du dépôt.
- `container/` **échappe à ESLint et Prettier** dans les deux backends.
- `LEGACY_B2B_FRONT` (`lfc-b2b.pages.dev`) reste autorisée en CORS : une build
  qu'aucun workflow ne met à jour.
- Le **parcours utilisateur complet**, connexion Auth0 comprise, n'a jamais été
  vérifié de bout en bout.
- Amener un **domaine** sur Cloudflare.
