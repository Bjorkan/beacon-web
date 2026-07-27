import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PacketTableHeader } from "../../../src/features/packets/PacketTableHeader";
import { GRID_TEMPLATE } from "../../../src/features/packets/packet-grid";

describe("PacketTableHeader", () => {
  it("declares every column heading", () => {
    render(<PacketTableHeader />);
    for (const h of ["Hash", "Type", "Route", "Obs", "Observer", "IATA", "Age"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it("is hidden below md", () => {
    const { container } = render(<PacketTableHeader />);
    expect(container.firstElementChild?.className).toContain("hidden");
    expect(container.firstElementChild?.className).toContain("md:grid");
  });

  it("applies the shared GRID_TEMPLATE so columns align with the row", () => {
    const { container } = render(<PacketTableHeader />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.gridTemplateColumns).toBe(GRID_TEMPLATE);
  });

  it("has exactly 8 cells, one per row column including the chevron spacer", () => {
    const { container } = render(<PacketTableHeader />);
    expect(container.firstElementChild?.children).toHaveLength(8);
  });

  it("leaves the leading chevron-alignment cell unlabeled and hidden from screen readers", () => {
    const { container } = render(<PacketTableHeader />);
    const first = container.firstElementChild?.children[0];
    expect(first).toHaveAttribute("aria-hidden");
    expect(first?.textContent).toBe("");
  });
});
