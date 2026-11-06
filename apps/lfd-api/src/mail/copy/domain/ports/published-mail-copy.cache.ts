/**
 * Le geste qui rend caduc le cache du publié que le mailer lit, après une
 * publication sur CETTE instance. Les autres le voient au plus tard à leur
 * prochaine relecture de la version.
 */
export abstract class PublishedMailCopyCache {
  abstract forget(): void;
}
