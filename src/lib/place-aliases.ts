// Places the searches know beyond countries and continents (the Baymard review of 2026-11-07): the
// regions hikers search for, the other names of a few countries, and topics. One small list, shared by
// the header search (TrailSearch.astro), the home page's trip search (TripSearch.astro, its Where
// field) and the search page's Where filter (`where=Alps` keeps the trails of a region, matches() in
// src/lib/filters.ts), through src/lib/search-match.ts.
//
// To add a region: one entry with its English `name` (what the suggestion and the filter chip show),
// `also` for other spellings and languages (matched as typed, accents optional), and which trails it
// holds, from the records wherever they say it: `regions` (a record's first-level regions, any of
// them; spelled as the records spell them, several spellings if they differ), limited to `countries`
// if a region's name also exists elsewhere, and `trails` (record slugs) for what the records don't
// say (a mountain range, a forest). A trail is in the region if it is listed or has one of the regions.
// Every entry must hold at least one trail (tests/search-match.test.ts checks it); keep the list small
// (it ships with the search's script, about 1 KB) and use names hikers type, not administrative ones.
export interface PlaceAlias {
  name: string;
  also?: string[];
  regions?: string[];
  countries?: string[]; // country names as the search shows them ("United Kingdom")
  trails?: string[];
}

export const PLACE_ALIASES: PlaceAlias[] = [
  {
    name: "Alps",
    also: ["Alpen", "Alpes", "Alpi", "Alpine"],
    trails: ["adlerweg", "alpe-adria-trail", "alta-via-1", "berliner-hoehenweg", "karwendel-hoehenweg", "lechweg", "merano-high-mountain-trail", "stubaier-hoehenweg", "tour-du-mont-blanc"],
  },
  { name: "Dolomites", also: ["Dolomiti", "Dolomiten"], trails: ["alta-via-1"] },
  { name: "Pyrenees", also: ["Pyrénées", "Pirineos", "Pirineus"], trails: ["carros-de-foc"] },
  { name: "Scotland", also: ["Scottish"], regions: ["Scotland"], trails: ["west-highland-way"] },
  { name: "Wales", also: ["Cymru", "Welsh"], regions: ["Wales", "Powys", "Monmouthshire", "Denbighshire", "Flintshire", "Wrexham"] },
  {
    name: "England",
    also: ["English"],
    countries: ["United Kingdom"],
    regions: [
      "England", "North Yorkshire", "East Riding of Yorkshire", "Cumberland", "Westmorland and Furness", "Gloucestershire", "South Gloucestershire",
      "Worcestershire", "Herefordshire", "Shropshire", "Bath and North East Somerset", "Somerset", "Devon", "Cornwall", "Dorset", "Hampshire",
      "West Sussex", "East Sussex", "Surrey", "Kent", "Suffolk", "Norfolk", "Wiltshire", "Oxfordshire", "Berkshire", "Buckinghamshire",
      "Hertfordshire", "Greater London", "Redcar and Cleveland",
    ],
  },
  { name: "Lake District", also: ["Lakes", "Cumbria"], regions: ["Cumberland", "Westmorland and Furness"] },
  { name: "Patagonia", also: ["Patagonien", "Patagonie"], trails: ["huemul-circuit", "o-circuit", "w-trek"] },
  { name: "Black Forest", also: ["Schwarzwald", "Forêt-Noire"], trails: ["westweg", "schluchtensteig", "baiersbronner-seensteig"] },
  { name: "Bavaria", also: ["Bayern"], regions: ["Bavaria", "Bayern"] },
  { name: "Tyrol", also: ["Tirol"], countries: ["Austria"], regions: ["Tyrol"] },
  { name: "South Tyrol", also: ["Südtirol", "Alto Adige"], trails: ["alta-via-1", "merano-high-mountain-trail"] },
  { name: "New England", countries: ["United States"], regions: ["Vermont", "New Hampshire", "Massachusetts", "Connecticut", "Maine", "Rhode Island"] },
  {
    name: "Pacific Northwest",
    also: ["PNW", "Cascadia"],
    countries: ["United States"],
    regions: ["Washington", "Oregon", "Idaho"],
    trails: ["juan-de-fuca-marine-trail", "west-coast-trail", "sunshine-coast-trail"],
  },
  { name: "Rocky Mountains", also: ["Rockies"], trails: ["colorado-trail", "great-divide-trail", "teton-crest-trail", "rockwall-trail"] },
  { name: "Scandinavia", also: ["Skandinavien", "Nordic"], countries: ["Sweden", "Denmark", "Norway", "Finland"] },
  { name: "Fiordland", regions: ["Fiordland"] },
  { name: "Tasmania", regions: ["Tasmania"] },
  { name: "Corsica", also: ["Corse", "Korsika"], regions: ["Corsica"] },
  { name: "Saxon Switzerland", also: ["Sächsische Schweiz", "Elbe Sandstone"], trails: ["malerweg", "forststeig-elbe-sandstone"] },
  // other names of countries (the country itself comes from the records)
  { name: "United Kingdom", also: ["UK", "Britain", "Great Britain"], countries: ["United Kingdom"] },
  { name: "United States", also: ["USA", "US", "America"], countries: ["United States"] },
  { name: "Germany", also: ["Deutschland"], countries: ["Germany"] },
  { name: "Austria", also: ["Österreich"], countries: ["Austria"] },
  { name: "Switzerland", also: ["Schweiz", "Suisse", "Svizzera"], countries: ["Switzerland"] },
  { name: "Italy", also: ["Italia", "Italien"], countries: ["Italy"] },
  { name: "Spain", also: ["España", "Spanien"], countries: ["Spain"] },
  { name: "New Zealand", also: ["Aotearoa", "NZ"], countries: ["New Zealand"] },
];

// the trail's places among those above (not the countries' other names, which only add search words)
export function placesOf(t: { slug: string; countries: string[]; regions: string[] }) {
  return PLACE_ALIASES.filter(
    (p) =>
      !isCountryName(p) &&
      ((p.trails ?? []).includes(t.slug) ||
        (Boolean(p.regions?.length || p.countries?.length) &&
          (!p.countries || p.countries.some((c) => t.countries.includes(c))) &&
          (!p.regions || p.regions.some((r) => t.regions.includes(r))))),
  ).map((p) => p.name);
}

// an entry that only gives a country other names: its own name is the country's
export const isCountryName = (p: PlaceAlias) => !p.regions && !p.trails && p.countries?.length === 1 && p.countries[0] === p.name;
