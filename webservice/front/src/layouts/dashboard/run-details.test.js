import "regenerator-runtime/runtime";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { MaterialUIControllerProvider } from "context";
import theme from "assets/theme";
import RunDetails from "./run-details";

jest.mock("api/grasp", () => ({
  getMonitorRun: jest.fn(),
}));

jest.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mock-line-chart">Mock chart</div>,
}));

jest.mock("examples/Tables/DataTable", () => () => <div>Mock persisted history table</div>);

const { getMonitorRun } = require("api/grasp");

describe("RunDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders run details for the selected seed", async () => {
    getMonitorRun.mockResolvedValue({
      seedId: "seed-123",
      rclAlgorithm: "IG",
      classifier: "J48",
      stage: "best_solution",
      topic: "BEST_SOLUTION_TOPIC",
      trainingFileName: "ereno1ktrain.arff",
      testingFileName: "ereno1ktest.arff",
      bestF1Score: 100,
      currentF1Score: 100,
      cpuUsage: 12.5,
      memoryUsage: 1024,
      memoryUsagePercent: 45.2,
      createdAt: "2026-03-13T18:00:00.000Z",
      updatedAt: "2026-03-13T18:05:00.000Z",
      solutionFeatures: [1, 3, 5, 8],
      history: [
        {
          timestamp: "2026-03-13T18:01:00.000Z",
          stage: "initial_solution",
          topic: "INITIAL_SOLUTION_TOPIC",
          localSearch: null,
          neighborhood: "VND",
          f1Score: 66.67,
          solutionFeatures: [1, 3, 5],
        },
      ],
    });

    render(
      <ThemeProvider theme={theme}>
        <MaterialUIControllerProvider>
          <MemoryRouter initialEntries={["/dashboard/runs/seed-123"]}>
            <Routes>
              <Route path="/dashboard/runs/:seedId" element={<RunDetails />} />
            </Routes>
          </MemoryRouter>
        </MaterialUIControllerProvider>
      </ThemeProvider>
    );

    expect(await screen.findByText("Execution summary")).toBeInTheDocument();
    expect(screen.getByText("Persisted history")).toBeInTheDocument();
    expect(screen.getByText("Back to dashboard")).toBeInTheDocument();
  });
});
