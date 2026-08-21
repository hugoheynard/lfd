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
| [`mailer-resend.md`](mailer-resend.md)                                     | « Pourquoi l'e-mail n'est pas arrivé ? » — le domaine à vérifier, les 4 réglages, les contrôles  |
| [`architecture-stockage-media.md`](architecture-stockage-media.md)         | « Où vivent les images, et pourquoi il faut un domaine ? » — R2, cache, ce que « CDN » recouvre  |

Voir aussi, hors de ce dossier :
[`b2b/admin-app-ios-capacitor.md`](../b2b/admin-app-ios-capacitor.md) (l'admin en
app iPhone) et
[`suite/architecture-suite-gateway-scaling.md`](../suite/architecture-suite-gateway-scaling.md)
(le plan d'origine, dont la partie « sous-domaines » attend un domaine).

## Le résumé en dix lignes

- **Une seule porte d'entrée** : le Worker `lfd-gateway`. Les deux backends
  n'ont **aucune adresse publique** ; on les atteint par _service binding_.
- **Routage par préfixe de chemin** (`/api/lfd`), retiré avant
  transmission. Le jour où un domaine existera, on repassera aux sous-domaines
  sans toucher aux backends.
- **Containers ancrés en Europe de l'Ouest** (`lhr20`, Londres). Sans contrainte
  explicite, ils atterrissaient au Texas.
- **Le seul rate-limit qui fonctionne est le throttler NestJS.** Celui de l'edge
  Cloudflare est inerte — prouvé, ne pas re-diagnostiquer.
- **Une zone Cloudflare existe** (`lafoliecoffee.info`, prise le 2026-08-16
  pour le courrier) mais **rien ne passe encore par elle** : les Workers et les
  Pages restent sur `workers.dev` / `pages.dev`, donc toujours pas de WAF ni de
  règles de rate limiting. C'est le prochain levier structurant — et le
  prérequis, lui, est déjà payé.

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

- `container/` **échappe à ESLint et Prettier** dans les deux backends.
- `LEGACY_B2B_FRONT` (`lfc-b2b.pages.dev`) reste autorisée en CORS : une build
  qu'aucun workflow ne met à jour.
- Le **parcours utilisateur complet**, connexion Auth0 comprise, n'a jamais été
  vérifié de bout en bout.
- **Faire servir la zone.** Le domaine est là ; aucune des sept choses
  déployées n'est derrière lui. Le premier usage prévu est le domaine média
  ([`architecture-stockage-media.md`](architecture-stockage-media.md)).
