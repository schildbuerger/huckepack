# huckepack

A website that collects and visualises data about official long-distance
hiking trails around the world, focused on the well-known routes people
thru-hike: the Appalachian Trail, the Pacific Crest Trail, Te Araroa, the GR 20,
the Camino Francés and their peers. Each trail gets one page with its route,
elevation profile, terrain, climate along the way, resupply points, permits and
season, and the site compares trails with each other.

Planning notes: [docs/scope.md](docs/scope.md) (decisions and open questions),
[docs/data-sources.md](docs/data-sources.md) (sources and licences),
[docs/roadmap.md](docs/roadmap.md) (trails and features, ranked).

## Status

Early: a trail database schema, the first trail (the Path of Sacred Forests in
Italy, a draft built from the national park's stage pages), a filterable
index page and one page per trail. Maps, charts, search and the data
pipeline come next.

## Development

Node 22.12 or later.

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # static site in dist/
npm run check   # type check
```

Trails live in `data/trails/`, one YAML file per trail, checked against the
schema in `src/content.config.ts` on every build. Every figure names the
source it comes from, and each source records its licence and when it was
retrieved. `pipeline/` (Python) will download and process source data into
`data/raw/` and write the results into the trail files.
