# TODO — `Server-Timing` et `X-Shelf-Cache` sont publics

> 📝 **Dette acceptée par Hugo le 2026-11-05** (« pour l'instant j'accepte la
> fuite »). Personne ne l'a prise. À traiter avant l'ouverture commerciale.

## Le problème, simplement

Chaque réponse de l'API dit au navigateur, à **n'importe quel visiteur**, comment
elle a été fabriquée : vérification du jeton, résolution du principal (et,
depuis le 2026-11-05, s'il vient de la mémoire ou d'une résolution complète,
`principal-source`, et le coût de l'estampille, `stamp`), passage par le
container, le Worker, la passerelle et le point de présence Cloudflare. Le rayon
public dit en plus pourquoi il est ou n'est pas gardé (`X-Shelf-Cache`).

Ce ne sont pas des données personnelles, mais des **informations de
conception** : elles décrivent l'architecture et laissent voir, dans les
durées, un succès ou un échec de cache. L'OWASP le range en « divulgation
d'information », gravité faible — une aide à qui prépare une attaque, pas une
faille en soi. La bonne pratique est de ne pas l'exposer par défaut.

Aucune fuite entre clients n'a été trouvée : le principal est gardé par
personne, le rayon par société.

## La correction proposée

1. **La passerelle (`gateway/`) retire `Server-Timing` et `X-Shelf-Cache`** de
   toute réponse publique — elle est déjà la frontière de confiance.
2. **Elle les garde pour une requête de diagnostic** qui porte un en-tête
   secret, posé par Hugo en secret de la passerelle (jamais dans le code).
3. **Le suivi dans le temps passe par les traces Cloudflare**, privées au
   compte (déjà activées).
4. Reste à concevoir : comment mesurer depuis le navigateur avec cet en-tête
   (extension, ou réglage de diagnostic du staff).

Touche la frontière de sécurité : `vitruve` avant le bâti.

## Où ça vit

- `apps/lfd-api/src/platform/metrics/server-timing.ts` — les marques de Nest.
- `apps/lfd-api/container/server-timing.ts` et `gateway/src/server-timing.ts` —
  `container`, `worker`, `gateway`.
- `apps/lfd-api/src/b2b/catalog/http/public-shelf-cache-headers.ts` —
  `X-Shelf-Cache`.
