import "regenerator-runtime/runtime";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { MaterialUIControllerProvider } from "context";
import theme from "assets/theme";
import DataTable from "./index";
import { downloadTextFile } from "utils/graspDashboardExport";

jest.mock("utils/graspDashboardExport", () => ({
  downloadTextFile: jest.fn(),
}));

function renderTable(locale = "en-US", overrides = {}) {
  window.localStorage.setItem("locale", locale);
  return render(
    <ThemeProvider theme={theme}>
      <MaterialUIControllerProvider>
        <DataTable
          table={{
            columns: [{ Header: "Name", accessor: "name", align: "left" }],
            rows: [
              { name: "A" },
              { name: "B" },
              { name: "C" },
              { name: "D" },
            ],
          }}
          entriesPerPage={{ defaultValue: 2, entries: [2, 4] }}
          showTotalEntries
          canSearch
          {...overrides}
        />
      </MaterialUIControllerProvider>
    </ThemeProvider>
  );
}

describe("DataTable", () => {
  beforeEach(() => {
    window.localStorage.clear();
    downloadTextFile.mockClear();
  });

  it("renders english pagination labels", () => {
    renderTable("en-US");

    expect(screen.getByText("items per page")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 2 of 4 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeInTheDocument();
  });

  it("renders portuguese pagination labels", () => {
    renderTable("pt-BR");

    expect(screen.getByText("itens por pagina")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1 a 2 de 4 itens")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar JSON" })).toBeInTheDocument();
  });

  it("exports filtered table data as csv and omits action columns", async () => {
    renderTable("en-US", {
      table: {
        columns: [
          { Header: "Name", accessor: "name", align: "left" },
          { Header: "Role", accessor: "role", align: "left" },
          { Header: "Actions", accessor: "actions", align: "left" },
        ],
        rows: [
          { name: "Alice", role: "ADMIN", actions: <button type="button">Edit</button> },
          { name: "Bob", role: "VIEWER", actions: <button type="button">Edit</button> },
        ],
      },
    });

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "Alice" },
    });

    await waitFor(() => {
      expect(screen.getByText("Showing 1 to 1 of 1 item")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(downloadTextFile).toHaveBeenCalledTimes(1);

    const [, exportedContent, exportedMimeType] = downloadTextFile.mock.calls[0];

    expect(exportedContent).toContain("Name,Role");
    expect(exportedContent).toContain("Alice,ADMIN");
    expect(exportedContent).not.toContain("Bob");
    expect(exportedContent).not.toContain("Actions");
    expect(exportedContent).not.toContain("Edit");
    expect(exportedMimeType).toBe("text/csv;charset=utf-8");
  });
});
