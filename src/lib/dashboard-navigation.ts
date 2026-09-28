type NavigationMenu = {
  items: ReadonlyArray<{ href: string }>;
};

const pathMatchesHref = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Returns the single, most specific sidebar destination for the current route. */
export function getActiveDashboardNavHref(
  pathname: string,
  menus: ReadonlyArray<NavigationMenu>
): string | null {
  const effectivePath = pathname.startsWith('/dashboard/alumno/ejercicios/')
    ? '/dashboard/alumno/materias'
    : pathname;

  let bestMatch: string | null = null;
  for (const menu of menus) {
    for (const { href } of menu.items) {
      if (pathMatchesHref(effectivePath, href) && href.length > (bestMatch?.length ?? 0)) {
        bestMatch = href;
      }
    }
  }
  return bestMatch;
}
