import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "../src/router";

async function routerAt(entry: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [entry] }));
  await router.load();
  return router;
}

function routeSearch(router: Awaited<ReturnType<typeof routerAt>>) {
  return router.state.matches.at(-1)?.search ?? {};
}

describe("application routes", () => {
  it("opens entity deep links directly", async () => {
    const router = await routerAt("/nodes/node-123?iata=yvr,yyj");

    expect(router.state.location.pathname).toBe("/nodes/node-123");
    expect(routeSearch(router).iata).toEqual(["YVR", "YYJ"]);
  });

  it("normalizes historical tab and entity params once", async () => {
    const router = await routerAt("/?tab=Observers&observer=observer-7&region=yvr");

    expect(router.state.location.pathname).toBe("/observers/observer-7");
    expect(routeSearch(router).iata).toEqual(["YVR"]);
    expect(routeSearch(router).tab).toBeUndefined();
    expect(routeSearch(router).observer).toBeUndefined();
  });

  it("keeps the old Stats name compatible", async () => {
    const router = await routerAt("/?tab=Stats&statsTab=observer&observerId=observer-9&range=7d");

    expect(router.state.location.pathname).toBe("/analytics");
    expect(routeSearch(router)).toMatchObject({
      statsTab: "observer",
      observerId: "observer-9",
      range: "7d",
    });
  });

  it("validates map state at the route boundary", async () => {
    const router = await routerAt("/map?lat=59.33&lng=18.07&zoom=9&clustering=off&node_type=repeater&flow=on");

    expect(routeSearch(router)).toMatchObject({
      lat: 59.33,
      lng: 18.07,
      zoom: 9,
      clustering: false,
      node_type: "repeater",
      flow: true,
    });
  });

  it("serializes multi-value filters with the established CSV contract", async () => {
    const router = await routerAt("/packets");
    await router.navigate({
      to: "/packets",
      search: (prev) => ({ ...prev, types: [2, 4], scope: ["#north", "#west"] }),
    });

    expect(router.state.location.href).toContain("types=2%2C4");
    expect(router.state.location.href).toContain("scope=%23north%2C%23west");
    expect(routeSearch(router).types).toEqual([2, 4]);
  });

  it("restores route state through browser back navigation", async () => {
    const router = await routerAt("/packets?types=4");
    await router.navigate({ to: "/nodes/node-1", search: (prev) => ({ ...prev }) });
    expect(router.state.location.pathname).toBe("/nodes/node-1");

    router.history.back();
    await router.load();

    expect(router.state.location.pathname).toBe("/packets");
    expect(routeSearch(router).types).toEqual([4]);
  });
});
