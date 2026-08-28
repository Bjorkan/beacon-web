// One track list shared by the sticky header and every row, so columns stay aligned. Keep every
// track font- and content-independent: the header and the rows are separate grids, so a `ch` track
// resolves against each one's own font size (9px vs 11px) and an `auto` track against its own text
// ("HASH" vs "4AE77F09") — either silently drifts the two apart.
// The Region track takes minmax(0,1fr) so it absorbs leftover width on wide screens (full region
// names read fine stretched) while Age keeps a fixed right-aligned column at the edge.
export const GRID_TEMPLATE =
  "1.25rem 5rem 6rem 7.5rem 3rem 3rem 3.5rem minmax(8rem, 1fr) 5.5rem";
