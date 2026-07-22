type MediaQueryMatcher = (query: string) => Pick<MediaQueryList, "matches">;

const TOUCH_FIRST_POINTER_QUERY = "(hover: none) and (pointer: coarse)";

export function requiresCooperativeMapGestures(
  matchMedia: MediaQueryMatcher,
): boolean {
  return matchMedia(TOUCH_FIRST_POINTER_QUERY).matches;
}
