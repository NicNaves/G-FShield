# Versioned monolith snapshots

This directory preserves the two monolithic implementations used as experimental comparators:

- `monolith1-graspy2`: Gain Ratio construction followed by Bit-Flip;
- `monolith2-graspy`: configurable IG/GR/SU construction and IWSS/IWSSR/Bit-Flip search.

The initial files were copied from `/home/idscps/nicolas/graspy2` and
`/home/idscps/nicolas/Graspy` on `mc2-server-01` before any campaign fixes.
Datasets, logs, environments, caches, and credentials are intentionally excluded.

The historical directories did not contain Git metadata. Subsequent experimental
changes are made only to these versioned copies, and the campaign must run from
the committed G-FShield tree.
