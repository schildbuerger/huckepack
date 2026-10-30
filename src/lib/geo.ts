// Distances on the globe, shared by the home page's "Trails near you" and the trail map, so both
// measure and round alike.

// great-circle distance between two [lon, lat] points, km
export function kmBetween(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// rounded as far as a time zone's main city can tell: to 10, 50 or 100 km
export const roundDistance = (d: number) => (d < 100 ? Math.round(d / 10) * 10 : d < 1000 ? Math.round(d / 50) * 50 : Math.round(d / 100) * 100);
