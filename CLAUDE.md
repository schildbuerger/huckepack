# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

huckepack is a website that collects and visualises data about official long-distance hiking trails worldwide, focused on well-known thru-hiking routes: one page per trail plus comparisons across trails. docs/scope.md holds decisions and open questions (record new decisions there), docs/data-sources.md lists sources with their licences, docs/roadmap.md ranks candidate trails and features (update it when one is built).

The project is in planning: there is no code, build or test command yet. Add a Commands section here once there is one.

## Ground rules

- Only official trails: a route designated or maintained by a government body or a recognised trail association. Unofficial routes (for example the Hayduke Trail) are out of scope unless docs/scope.md says otherwise.
- Every figure on a page must come from a source listed in docs/data-sources.md, with its licence and retrieval date. Check a source's licence before using it: official GPX tracks are often copyrighted, and OpenStreetMap data requires ODbL attribution.
- Trail lengths, elevation gain and similar numbers differ between sources. Show which source a number comes from rather than silently picking one, and never mix them in one figure.
