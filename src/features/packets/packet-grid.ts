// Shared desktop packet grid. Keep fixed/font-independent tracks because the sticky header and the
// virtualized rows are separate grids. Compared with the old layout, observer+area gets one compact
// identity cell, hops+hash-size share one diagnostic cell, and the freed width becomes the inline
// path column rather than making the table wider.
export const GRID_TEMPLATE =
  "1.25rem 5rem 5.75rem 7rem minmax(8rem, 0.9fr) minmax(11rem, 1.35fr) 3.25rem 5.25rem 5.5rem";
