"""Data pipeline for huckepack.

Downloads source data (OpenStreetMap route relations, elevation, climate), caches the
raw downloads in data/raw/<trail>/, and writes the derived figures into the trail
records in data/trails/. The site build reads only data/trails/ and never downloads.
"""
