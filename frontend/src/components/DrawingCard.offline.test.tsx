import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DrawingCard } from "./DrawingCard";

vi.mock("../api", () => ({
  getDrawing: vi.fn(),
  getDrawingPreview: vi.fn(async () => null),
  isS3Enabled: vi.fn(async () => false),
}));

const baseDrawing = {
  id: "d1",
  name: "Team board",
  collectionId: null,
  updatedAt: Date.now(),
  createdAt: Date.now(),
  version: 1,
  preview: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
};

const renderCard = (props: Partial<React.ComponentProps<typeof DrawingCard>>) =>
  render(
    <DrawingCard
      drawing={baseDrawing}
      collections={[]}
      isSelected={false}
      onToggleSelection={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onMoveToCollection={vi.fn()}
      onDuplicate={vi.fn()}
      onClick={vi.fn()}
      {...props}
    />,
  );

describe("DrawingCard - offline mode", () => {
  it("tints a shared board whose owner turned on offline mode", () => {
    renderCard({
      drawing: { ...baseDrawing, accessLevel: "view", offlineAt: "2026-10-12T00:00:00Z" },
      isShared: true,
    });

    expect(screen.getByTestId("drawing-offline-tint-d1")).toHaveTextContent(
      "Owner turned on offline mode",
    );
  });

  it("does not tint the owner's own board", () => {
    renderCard({ drawing: { ...baseDrawing, offlineAt: "2026-10-12T00:00:00Z" } });

    expect(screen.queryByTestId("drawing-offline-tint-d1")).not.toBeInTheDocument();
  });

  it("offers the offline toggle to the owner only", () => {
    renderCard({});
    fireEvent.contextMenu(screen.getByText("Team board").closest(".drawing-card")!);
    expect(screen.getByText("Make available offline")).toBeInTheDocument();
  });

  it("hides the offline toggle on boards shared with you", () => {
    renderCard({ drawing: { ...baseDrawing, accessLevel: "edit" }, isShared: true });
    fireEvent.contextMenu(screen.getByText("Team board").closest(".drawing-card")!);
    expect(screen.queryByText("Make available offline")).not.toBeInTheDocument();
  });
});
