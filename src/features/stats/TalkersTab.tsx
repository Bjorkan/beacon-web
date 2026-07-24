import { useMemo } from "react";
import { useChartColors, nodeTypeColor } from "./chartTheme";
import { useTopAdvertisers, useTopTalkers } from "./useStats";
import { leaderboardOption } from "./chartOptions";
import { ChartCard } from "./cards";
import type { StatsRange } from "./types";

interface TalkersTabProps {
  range: StatsRange;
}

// grow with the roster so bars stay readable; a floor keeps the loading/empty state from collapsing
function leaderboardHeight(count: number) {
  return Math.max(260, count * 34 + 24);
}

// The "noisy nodes, politely" tab: who's loudest by adverts and by channel chatter. Advertisers are
// coloured by node type; talkers are grouped by sender display-name (see TopTalker), hence "by name".
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
      })),
    [topAdvertisers.data, colors],
  );
  const advertisersOption = useMemo(() => leaderboardOption(advertiserRows, colors), [advertiserRows, colors]);

  const talkerRows = useMemo(
    () => (topTalkers.data ?? []).map((t) => ({ name: t.senderName, value: t.messageCount, color: colors.secondary })),
    [topTalkers.data, colors],
  );
  const talkersOption = useMemo(() => leaderboardOption(talkerRows, colors), [talkerRows, colors]);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3.5 px-4 py-4">
      <ChartCard
        title={<>Top advertisers · {range}</>}
        right={<span className="font-mono text-[10px] text-text-muted">by adverts</span>}
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
