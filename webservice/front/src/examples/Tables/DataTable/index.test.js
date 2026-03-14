import "regenerator-runtime/runtime";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { MaterialUIControllerProvider } from "context";
import theme from "assets/theme";
import DataTable from "./index";

function renderTable(locale = "en-US") {
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
        />
      </MaterialUIControllerProvider>
    </ThemeProvider>
  );
}

describe("DataTable", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders english pagination labels", () => {
    renderTable("en-US");

    expect(screen.getByText("items per page")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 2 of 4 items")).toBeInTheDocument();
  });

  it("renders portuguese pagination labels", () => {
    renderTable("pt-BR");

    expect(screen.getByText("itens por pagina")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1 a 2 de 4 itens")).toBeInTheDocument();
  });
});
