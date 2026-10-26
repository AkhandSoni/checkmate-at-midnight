/** Vite's base supports both a domain root and a GitHub Pages project path. */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + "assets/" + path;
}
