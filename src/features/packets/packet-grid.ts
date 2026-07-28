// One track list shared by the sticky header and every row, so columns stay aligned. Keep every
// track font- and content-independent: the header and the rows are separate grids, so a `ch` track
// resolves against each one's own font size (9px vs 11px) and an `auto` track against its own text
// ("HASH" vs "4AE77F09") — either silently drifts the two apart.
export const GRID_TEMPLATE = "1.25rem 5rem 6rem 5rem 3rem 3rem minmax(6rem,1fr) 3.5rem 5rem";
