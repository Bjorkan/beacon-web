import { useMemo } from "react";
import { useChartColors, nodeTypeColor } from "./chartTheme";
import { useTopAdvertisers, useTopTalkers } from "./useStats";
import { leaderboardOption } from "./chartOptions";
import { ChartCard } from "./cards";
import { NODE_TYPES } from "../../lib/node-types";
import type { ChartColors } from "./chartTheme";
import type { TopAdvertiser, StatsRange } from "./types";

interface TalkersTabProps {
  range: StatsRange;
}

// grow with the roster so bars stay readable; a floor keeps the loading/empty state from collapsing
function leaderboardHeight(count: number) {
  return Math.max(260, count * 34 + 24);
}

// Names the node-type colours the advertiser bars already use, so a bar's colour is legible as
// "repeater" or "companion". Only the types actually present are listed; unknowns fall under "Other".
function advertiserLegend(rows: TopAdvertiser[], c: ChartColors) {
  const present = new Set(rows.map((r) => r.nodeTypeName));
  const known = NODE_TYPES.filter((t) => present.has(t.name)).map((t) => ({
    label: t.label,
    color: nodeTypeColor(t.name, c),
  }));
  const knownNames = new Set<string>(NODE_TYPES.map((t) => t.name));
  const hasOther = [...present].some((n) => !knownNames.has(n));
  return hasOther ? [...known, { label: "Other", color: c.primaryDim }] : known;
}

// The "noisy nodes, politely" tab: who's loudest by adverts and by channel chatter. Advertisers are
// coloured by node type (see legend); talkers are grouped by sender display-name, hence "by name".
export function TalkersTab({ range }: TalkersTabProps) {
  const colors = useChartColors();
  const topAdvertisers = useTopAdvertisers(range, 20);
  const topTalkers = useTopTalkers(range, 20);

  const advertiserRows = useMemo(
    () =>
      (topAdvertisers.data ?? []).map((a) => ({
        name: a.nodeName ?? a.nodeId.slice(0, 8),
        value: a.advertCount,
        color: nodeTypeColor(a.nodeTypeName, colors),
        iata: a.iata,
      })),
    [topAdvertisers.data, colors],
  );
  const advertisersOption = useMemo(() => leaderboardOption(advertiserRows, colors), [advertiserRows, colors]);
  const legend = useMemo(() => advertiserLegend(topAdvertisers.data ?? [], colors), [topAdvertisers.data, colors]);

  const talkerRows = useMemo(
    () => (topTalkers.data ?? []).map((t) => ({ name: t.senderName, value: t.messageCount, color: colors.secondary })),
    [topTalkers.data, colors],
  );
  const talkersOption = useMemo(() => leaderboardOption(talkerRows, colors), [talkerRows, colors]);

  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-start gap-3.5 px-4 py-4 lg:grid-cols-2">
      <ChartCard
        title={<>Top advertisers · {range}</>}
        right={
          legend.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              {legend.map((t) => (
                <span key={t.label} className="flex items-center gap-1 font-mono text-[10px] text-text-muted">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
              ))}
            </div>
          ) : undefined
        }
        height={leaderboardHeight(advertiserRows.length)}
        option={advertisersOption}
        isLoading={topAdvertisers.isLoading}
        isError={topAdvertisers.isError}
        isEmpty={advertiserRows.length === 0}
      />
      <ChartCard
        title={<>Top talkers · {range}</>}
        right={<span className="font-mono text-[10px] text-text-muted">by name</span>}
        height={leaderboardHeight(talkerRows.length)}
        option={talkersOption}
        isLoading={topTalkers.isLoading}
        isError={topTalkers.isError}
        isEmpty={talkerRows.length === 0}
      />
    </div>
  );
}
