// A trail page's title (issue #23): "<name>: <length> hike in <countries> · huckepack". Search results
// show about 60 characters (issue #181), so a longer title is shortened step by step until it fits:
// "about" dropped, then the site's name (search results show it apart), then "and" written "&", then
// three or more countries as the first and "+2". Pure, so the tests can check it.
export const TITLE_MAX = 60;

export function trailTitle(name: string, km: string | null, approx: boolean, countries: string[]) {
  const listed = (xs: string[], and: string) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")}${and}${xs.at(-1)}` : xs[0]);
  const build = (o: { about: boolean; brand: boolean; and: string; short: boolean }) => {
    const where = o.short && countries.length > 2 ? `${countries[0]} +${countries.length - 1}` : listed(countries, o.and);
    const length = km ? `${approx && o.about ? "about " : ""}${km} km hike` : "hike";
    return `${name}: ${length} in ${where}${o.brand ? " · huckepack" : ""}`;
  };
  const steps = [
    { about: true, brand: true, and: " and ", short: false },
    { about: false, brand: true, and: " and ", short: false },
    { about: false, brand: false, and: " and ", short: false },
    { about: false, brand: false, and: " & ", short: false },
    { about: false, brand: false, and: " & ", short: true },
  ];
  for (const s of steps) {
    const title = build(s);
    if (title.length <= TITLE_MAX) return title;
  }
  return build(steps.at(-1)!);
}
