import { GRID_TEMPLATE } from "./packet-grid";
import { useTranslation } from "react-i18next";

// Sticky above the virtualizer's spacer, never inside measured item space.
export function PacketTableHeader() {
  const { t } = useTranslation();
  return (
    <div
      className="hidden md:grid sticky top-0 z-10 gap-x-3 px-3 py-1.5 bg-bg-surface border-b border-border text-[9px] uppercase tracking-wider text-text-muted"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span aria-hidden />
      <span>Hash</span>
      <span>{t("entities.type")}</span>
      <span>{t("routes.route")}</span>
      <span>Obs</span>
      <span>{t("packets.hops")}</span>
      <span>{t("packets.hashSize")}</span>
      <span>IATA</span>
      <span className="text-right">{t("packets.age")}</span>
    </div>
  );
}
