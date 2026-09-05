import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/api/documents", () => ({
  listDocuments: vi.fn().mockResolvedValue([]),
  uploadDocument: vi.fn(),
}));

import { DocumentsPage } from "../src/pages/DocumentsPage";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("DocumentsPage", () => {
  it("renders the heading", () => {
    renderWithQueryClient(<DocumentsPage />);
    expect(screen.getByRole("heading", { name: /documents/i })).toBeInTheDocument();
  });

  it("shows the empty state once the (mocked) document list resolves", async () => {
    renderWithQueryClient(<DocumentsPage />);
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });
});
