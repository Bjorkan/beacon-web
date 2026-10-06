// 0/0 is an advert reset, not Null Island; a single zero axis is still a valid location.
export function hasMapLocation(
  node:
    { latitude?: number | null; longitude?: number | null } | null | undefined,
): node is { latitude: number; longitude: number } {
  return (
    node?.latitude != null &&
    node.longitude != null &&
    Number.isFinite(node.latitude) &&
    Number.isFinite(node.longitude) &&
    Math.abs(node.latitude) <= 90 &&
    Math.abs(node.longitude) <= 180 &&
    (node.latitude !== 0 || node.longitude !== 0)
  );
}
