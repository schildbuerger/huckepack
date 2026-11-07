// Other names of places, for the searches (the header search, TrailSearch.astro, and the trip
// search's Where, TripSearch.astro, through src/lib/search-match.ts). Which trails a place holds is
// never decided here: countries and continents come from the records, regions from open data
// (pipeline/regions.py: Natural Earth's first-level subdivisions and geography regions, a trail
// belonging where at least 20 % of its main route lies; the user's rule of 2026-11-07).
//
// To add a name: the place's `name` exactly as the search shows it (a country as the records name
// it, a region as the derived data name it, see data/derived/<slug>.json `regions`: English, from
// Wikidata for first-level subdivisions), and `also`, other spellings and languages hikers type
// (accents optional; the region's own local name is in the derived data already). A name for a place no trail lies in does
// nothing until one does.
export interface PlaceAlias {
  name: string;
  also: string[];
}

export const PLACE_ALIASES: PlaceAlias[] = [
  // regions (Natural Earth's names)
  { name: "Alps", also: ["Alpen", "Alpes", "Alpi", "Alpine"] },
  { name: "Pyrenees", also: ["Pyrénées", "Pirineos", "Pirineus", "Pyrenäen"] },
  // not in Natural Earth's geography regions (2026-11-07), so no trail is in it yet
  { name: "Black Forest", also: ["Schwarzwald", "Forêt-Noire"] },
  { name: "Bavaria", also: ["Bayern"] },
  { name: "Tyrol", also: ["Tirol"] },
  { name: "Scotland", also: ["Scottish"] },
  { name: "Wales", also: ["Cymru", "Welsh"] },
  { name: "England", also: ["English"] },
  { name: "Patagonia", also: ["Patagonien", "Patagonie"] },
  { name: "Rocky Mountains", also: ["Rockies"] },
  { name: "Scandinavia", also: ["Skandinavien"] },
  { name: "Scandinavian Mountains", also: ["Kjølen", "Scandes", "Fjällen"] },
  { name: "Corsica", also: ["Korsika"] },
  { name: "Ore Mountains", also: ["Krušné hory"] },
  { name: "Apennines", also: ["Apennin", "Appennino"] },
  { name: "Iberian Peninsula", also: ["Iberia"] },
  { name: "Balearic Islands", also: ["Illes Balears"] },
  { name: "County Kerry", also: ["Kerry"] },
  { name: "County Wicklow", also: ["Wicklow"] },
  { name: "Baden-Württemberg", also: ["Baden-Wurttemberg", "Baden-Wuerttemberg"] },
  { name: "North Rhine-Westphalia", also: ["Nordrhein-Westfalen", "NRW"] },
  { name: "Rhineland-Palatinate", also: ["Rheinland-Pfalz"] },
  { name: "Lower Saxony", also: ["Niedersachsen"] },
  { name: "Saxony", also: ["Sachsen"] },
  { name: "Thuringia", also: ["Thüringen"] },
  { name: "Hesse", also: ["Hessen"] },
  { name: "Carinthia", also: ["Kärnten"] },
  { name: "Trentino-South Tyrol", also: ["South Tyrol", "Südtirol", "Alto Adige", "Trentino"] },
  { name: "Aosta Valley", also: ["Vallée d'Aoste"] },
  { name: "Catalonia", also: ["Catalunya"] },
  { name: "Galicia", also: ["Galiza"] },
  // countries (the records' names)
  { name: "United Kingdom", also: ["UK", "Britain", "Great Britain"] },
  { name: "United States", also: ["USA", "US", "America"] },
  { name: "Germany", also: ["Deutschland"] },
  { name: "Austria", also: ["Österreich"] },
  { name: "Switzerland", also: ["Schweiz", "Suisse", "Svizzera"] },
  { name: "Italy", also: ["Italia", "Italien"] },
  { name: "Spain", also: ["España", "Spanien"] },
  { name: "New Zealand", also: ["Aotearoa", "NZ"] },
];
