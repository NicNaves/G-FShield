/**
=========================================================
* Material Dashboard 2 React - v2.2.0
=========================================================

* Product Page: https://www.creative-tim.com/product/material-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)

Coded by www.creative-tim.com

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { isValidElement, useDeferredValue, useMemo, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTable, usePagination, useGlobalFilter, useSortBy } from "react-table";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDPagination from "components/MDPagination";
import DataTableHeadCell from "examples/Tables/DataTable/DataTableHeadCell";
import DataTableBodyCell from "examples/Tables/DataTable/DataTableBodyCell";
import useI18n from "hooks/useI18n";
import { downloadTextFile } from "utils/graspDashboardExport";

const EXPORT_TEXT_PROP_KEYS = [
  "label",
  "title",
  "aria-label",
  "alt",
  "value",
  "name",
  "primary",
  "secondary",
];

const EXPORT_ACTION_COLUMN_PATTERN = /\b(action|actions|acao|acoes)\b/i;

const sanitizeFilePart = (value, fallback = "table") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
};

const flattenExportValue = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => flattenExportValue(entry))
      .filter(Boolean)
      .join(" | ");
  }

  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isValidElement(value)) {
    const propValues = EXPORT_TEXT_PROP_KEYS.map((key) => flattenExportValue(value.props?.[key])).filter(Boolean);
    const childrenValue = flattenExportValue(value.props?.children);

    return [...new Set([...propValues, childrenValue].filter(Boolean))].join(" ").trim();
  }

  if (typeof value === "object") {
    const namedValue = ["label", "value", "name", "title"]
      .map((key) => flattenExportValue(value[key]))
      .filter(Boolean)
      .join(" ");

    if (namedValue) {
      return namedValue.trim();
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  return String(value).trim();
};

const escapeCsvValue = (value) => {
  const serialized = flattenExportValue(value).replace(/"/g, '""');

  if (/[",\n\r]/.test(serialized)) {
    return `"${serialized}"`;
  }

  return serialized;
};

const buildExportFileName = (baseName, extension) => {
  const pathContext =
    typeof window !== "undefined"
      ? window.location.pathname.split("/").filter(Boolean).slice(-1)[0]
      : "table";
  const prefix = sanitizeFilePart(baseName || pathContext || "table");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return `${prefix}-${stamp}.${extension}`;
};

function DataTable({
  entriesPerPage,
  canSearch,
  canExport,
  exportFileName,
  showTotalEntries,
  table,
  pagination,
  isSorted,
  noEndBorder,
  virtualization,
  serverPagination,
  searchDebounceMs,
}) {
  const { t } = useI18n();
  const defaultValue = entriesPerPage.defaultValue ? entriesPerPage.defaultValue : 10;
  const entries = entriesPerPage.entries
    ? entriesPerPage.entries.map((entry) => entry.toString())
    : ["5", "10", "15", "20", "25"];
  const columns = useMemo(() => table.columns, [table.columns]);
  const data = useMemo(() => table.rows, [table.rows]);
  const tableContainerRef = useRef(null);
  const tableHeadRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [tableHeadHeight, setTableHeadHeight] = useState(0);
  const serverPaginationConfig =
    serverPagination && typeof serverPagination === "object" ? serverPagination : null;
  const manualPaginationEnabled = Boolean(serverPaginationConfig);
  const virtualizationConfig = virtualization && typeof virtualization === "object" ? virtualization : {};
  const virtualizationEnabled = virtualizationConfig.enabled !== false;
  const virtualizationRowHeight = Math.max(Number(virtualizationConfig.rowHeight || 60) || 60, 44);
  const virtualizationMaxHeight = Math.max(
    Number(virtualizationConfig.maxHeight || 420) || 420,
    virtualizationRowHeight * 4
  );
  const virtualizationThreshold = Math.max(Number(virtualizationConfig.threshold || 32) || 32, 1);
  const virtualizationOverscan = Math.max(Number(virtualizationConfig.overscan || 6) || 6, 1);
  const resolvedSearchDebounceMs = Math.max(
    Number(serverPaginationConfig?.searchDebounceMs ?? searchDebounceMs ?? 220) || 220,
    80
  );

  const tableInstance = useTable(
    { columns, data, initialState: { pageIndex: 0, pageSize: defaultValue || 10 } },
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    prepareRow,
    rows,
    page,
    pageOptions,
    canPreviousPage,
    canNextPage,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    setGlobalFilter,
    state: { pageIndex: internalPageIndex, pageSize: internalPageSize, globalFilter },
  } = tableInstance;

  useEffect(() => {
    if (manualPaginationEnabled) {
      setPageSize(serverPaginationConfig.pageSize || defaultValue || 10);
      return;
    }

    setPageSize(defaultValue || 10);
  }, [defaultValue, manualPaginationEnabled, serverPaginationConfig?.pageSize, setPageSize]);

  const setEntriesPerPage = (value) => {
    if (manualPaginationEnabled) {
      serverPaginationConfig.onPageSizeChange?.(value);
      return;
    }

    setPageSize(value);
  };

  const leafColumns = useMemo(() => headerGroups[headerGroups.length - 1]?.headers || [], [headerGroups]);
  const bodyColumnCount = Math.max(leafColumns.length || columns.length || 1, 1);

  const exportColumns = useMemo(
    () =>
      leafColumns
        .map((column, index) => {
          const headerLabel = flattenExportValue(column.render("Header"));
          const fallbackLabel =
            flattenExportValue(column.Header) ||
            (typeof column.accessor === "string" ? column.accessor : "") ||
            `column_${index + 1}`;
          const label = (headerLabel || fallbackLabel || `column_${index + 1}`).trim();
          const identifier = [column.id, typeof column.accessor === "string" ? column.accessor : "", label]
            .filter(Boolean)
            .join(" ");

          return {
            id: column.id,
            label,
            skip:
              column.disableExport === true ||
              column.export === false ||
              EXPORT_ACTION_COLUMN_PATTERN.test(identifier),
          };
        })
        .filter((column) => column.id && !column.skip),
    [leafColumns]
  );

  const buildExportDataset = () => {
    const preparedRows = rows.map((row) => {
      prepareRow(row);
      return row;
    });

    const exportRows = preparedRows.map((row) =>
      exportColumns.reduce((record, column) => {
        const cell = row.cells.find((candidate) => candidate.column.id === column.id);
        const rawValue = flattenExportValue(cell?.value ?? row.values?.[column.id]);
        const renderedValue = flattenExportValue(cell?.render("Cell"));

        return {
          ...record,
          [column.id]: renderedValue || rawValue,
        };
      }, {})
    );

    const nonEmptyColumns = exportColumns.filter(
      (column) =>
        exportRows.length === 0 ||
        exportRows.some((row) => flattenExportValue(row[column.id]).length > 0)
    );

    return {
      columns: nonEmptyColumns,
      rows: exportRows.map((row) =>
        nonEmptyColumns.reduce(
          (record, column) => ({
            ...record,
            [column.id]: row[column.id] ?? "",
          }),
          {}
        )
      ),
    };
  };

  const handleExportCsv = () => {
    const dataset = buildExportDataset();
    const csvRows = [
      dataset.columns.map((column) => escapeCsvValue(column.label)).join(","),
      ...dataset.rows.map((row) =>
        dataset.columns.map((column) => escapeCsvValue(row[column.id])).join(",")
      ),
    ];

    downloadTextFile(buildExportFileName(exportFileName, "csv"), csvRows.join("\n"), "text/csv;charset=utf-8");
  };

  const handleExportJson = () => {
    const dataset = buildExportDataset();
    const payload = {
      exportedAt: new Date().toISOString(),
      rowCount: dataset.rows.length,
      columns: dataset.columns.map((column) => ({
        id: column.id,
        label: column.label,
      })),
      rows: dataset.rows,
    };

    downloadTextFile(
      buildExportFileName(exportFileName, "json"),
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  };

  const resolvedPageIndex = manualPaginationEnabled
    ? Math.max(Number(serverPaginationConfig.pageIndex) || 0, 0)
    : internalPageIndex;
  const resolvedPageSize = manualPaginationEnabled
    ? Math.max(Number(serverPaginationConfig.pageSize) || defaultValue || 10, 1)
    : internalPageSize;
  const resolvedPageOptions = manualPaginationEnabled
    ? Array.from({
      length: Math.max(
        Number(serverPaginationConfig.pageCount)
          || Math.ceil((Number(serverPaginationConfig.totalEntries) || 0) / resolvedPageSize)
          || 1,
        1
      ),
    }, (_, index) => index)
    : pageOptions;
  const resolvedCanPreviousPage = manualPaginationEnabled ? resolvedPageIndex > 0 : canPreviousPage;
  const resolvedCanNextPage = manualPaginationEnabled
    ? resolvedPageIndex + 1 < resolvedPageOptions.length
    : canNextPage;

  const goToResolvedPage = (nextPageIndex) => {
    if (manualPaginationEnabled) {
      serverPaginationConfig.onPageChange?.(nextPageIndex);
      return;
    }

    gotoPage(nextPageIndex);
  };

  const goToNextResolvedPage = () => {
    if (manualPaginationEnabled) {
      serverPaginationConfig.onPageChange?.(resolvedPageIndex + 1);
      return;
    }

    nextPage();
  };

  const goToPreviousResolvedPage = () => {
    if (manualPaginationEnabled) {
      serverPaginationConfig.onPageChange?.(resolvedPageIndex - 1);
      return;
    }

    previousPage();
  };

  const renderPagination = resolvedPageOptions.map((option) => (
    <MDPagination
      item
      key={option}
      onClick={() => goToResolvedPage(Number(option))}
      active={resolvedPageIndex === option}
    >
      {option + 1}
    </MDPagination>
  ));

  const handleInputPagination = ({ target: { value } }) => {
    const nextPageIndex = Number(value) - 1;
    if (Number.isNaN(nextPageIndex) || nextPageIndex < 0 || nextPageIndex >= resolvedPageOptions.length) {
      goToResolvedPage(0);
      return;
    }

    goToResolvedPage(nextPageIndex);
  };

  const customizedPageOptions = resolvedPageOptions.map((option) => option + 1);

  const [search, setSearch] = useState(
    manualPaginationEnabled ? serverPaginationConfig.search || "" : globalFilter || ""
  );
  const deferredSearch = useDeferredValue(search);
  const latestSetGlobalFilterRef = useRef(setGlobalFilter);
  const lastAppliedGlobalFilterRef = useRef(globalFilter || undefined);

  useEffect(() => {
    latestSetGlobalFilterRef.current = setGlobalFilter;
  }, [setGlobalFilter]);

  useEffect(() => {
    if (manualPaginationEnabled) {
      const normalizedServerSearch = serverPaginationConfig.search || "";
      lastAppliedGlobalFilterRef.current = normalizedServerSearch || undefined;

      setSearch((currentValue) =>
        currentValue === normalizedServerSearch ? currentValue : normalizedServerSearch
      );
      return;
    }

    const normalizedGlobalFilter = globalFilter || "";
    lastAppliedGlobalFilterRef.current = globalFilter || undefined;

    setSearch((currentValue) =>
      currentValue === normalizedGlobalFilter ? currentValue : normalizedGlobalFilter
    );
  }, [globalFilter, manualPaginationEnabled, serverPaginationConfig?.search]);

  useEffect(() => {
    if (manualPaginationEnabled) {
      const nextServerSearch = deferredSearch || "";
      if ((serverPaginationConfig.search || "") === nextServerSearch) {
        return undefined;
      }

      const debounceHandle = window.setTimeout(() => {
        serverPaginationConfig.onSearchChange?.(nextServerSearch);
      }, resolvedSearchDebounceMs);

      return () => window.clearTimeout(debounceHandle);
    }

    const nextGlobalFilter = deferredSearch || undefined;
    if (lastAppliedGlobalFilterRef.current === nextGlobalFilter) {
      return undefined;
    }

    const debounceHandle = window.setTimeout(() => {
      lastAppliedGlobalFilterRef.current = nextGlobalFilter;
      latestSetGlobalFilterRef.current(nextGlobalFilter);
    }, resolvedSearchDebounceMs);

    return () => window.clearTimeout(debounceHandle);
  }, [deferredSearch, manualPaginationEnabled, resolvedSearchDebounceMs, serverPaginationConfig]);

  const setSortedValue = (column) => {
    if (!isSorted) {
      return false;
    }

    if (column.isSorted) {
      return column.isSortedDesc ? "desc" : "asce";
    }

    return "none";
  };

  const currentPageRowCount = page.length;
  const totalEntries = manualPaginationEnabled
    ? Math.max(Number(serverPaginationConfig.totalEntries) || 0, 0)
    : rows.length;
  const entriesStart = totalEntries === 0 ? 0 : resolvedPageIndex * resolvedPageSize + 1;
  const entriesEnd = totalEntries === 0
    ? 0
    : Math.min(totalEntries, resolvedPageIndex * resolvedPageSize + currentPageRowCount);
  const totalLabel = totalEntries === 1 ? t("datatable.itemSingular") : t("datatable.itemPlural");
  const hasToolbar = entriesPerPage || canSearch || canExport;
  const shouldVirtualize = virtualizationEnabled && currentPageRowCount >= virtualizationThreshold;
  const virtualWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        start: 0,
        end: currentPageRowCount,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const effectiveScrollTop = Math.max(scrollTop - tableHeadHeight, 0);
    const visibleRowCount = Math.max(Math.ceil(virtualizationMaxHeight / virtualizationRowHeight), 1);
    const start = Math.max(Math.floor(effectiveScrollTop / virtualizationRowHeight) - virtualizationOverscan, 0);
    const end = Math.min(
      start + visibleRowCount + virtualizationOverscan * 2,
      currentPageRowCount
    );

    return {
      start,
      end,
      topSpacerHeight: start * virtualizationRowHeight,
      bottomSpacerHeight: Math.max((currentPageRowCount - end) * virtualizationRowHeight, 0),
    };
  }, [
    currentPageRowCount,
    scrollTop,
    shouldVirtualize,
    tableHeadHeight,
    virtualizationMaxHeight,
    virtualizationOverscan,
    virtualizationRowHeight,
  ]);
  const renderedRows = useMemo(
    () =>
      page
        .slice(virtualWindow.start, virtualWindow.end)
        .map((row) => {
          prepareRow(row);
          return row;
        }),
    [page, prepareRow, virtualWindow.end, virtualWindow.start]
  );

  useEffect(() => {
    if (tableHeadRef.current) {
      setTableHeadHeight(tableHeadRef.current.offsetHeight || 0);
    }
  }, [headerGroups, resolvedPageSize, shouldVirtualize]);

  useEffect(() => {
    setScrollTop(0);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [globalFilter, resolvedPageIndex, resolvedPageSize, search, shouldVirtualize]);

  const handleTableScroll = (event) => {
    if (!shouldVirtualize) {
      return;
    }

    setScrollTop(event.currentTarget.scrollTop || 0);
  };

  return (
    <TableContainer
      ref={tableContainerRef}
      onScroll={handleTableScroll}
      sx={{
        boxShadow: "none",
        ...(shouldVirtualize
          ? {
              maxHeight: `${virtualizationMaxHeight}px`,
              overflowY: "auto",
            }
          : {}),
      }}
    >
      {hasToolbar ? (
        <MDBox
          display="flex"
          justifyContent="space-between"
          alignItems={{ xs: "stretch", md: "center" }}
          flexDirection={{ xs: "column", md: "row" }}
          gap={1.5}
          p={3}
        >
          <MDBox display="flex" alignItems="center" flexWrap="wrap" gap={1.25}>
            {entriesPerPage && (
              <Autocomplete
                disableClearable
                value={resolvedPageSize.toString()}
                options={entries}
                onChange={(event, newValue) => {
                  setEntriesPerPage(parseInt(newValue, 10));
                }}
                size="small"
                sx={{ width: "5rem" }}
                renderInput={(params) => <MDInput {...params} />}
              />
            )}
            {entriesPerPage && (
              <MDTypography variant="caption" color="secondary">
                {t("datatable.itemsPerPage")}
              </MDTypography>
            )}
            {canExport && (
              <MDBox display="flex" alignItems="center" flexWrap="wrap" gap={1}>
                <MDButton
                  variant="outlined"
                  color="info"
                  size="small"
                  startIcon={<Icon>table_view</Icon>}
                  onClick={handleExportCsv}
                  disabled={totalEntries === 0}
                >
                  {t("datatable.exportCsv")}
                </MDButton>
                <MDButton
                  variant="outlined"
                  color="secondary"
                  size="small"
                  startIcon={<Icon>data_object</Icon>}
                  onClick={handleExportJson}
                  disabled={totalEntries === 0}
                >
                  {t("datatable.exportJson")}
                </MDButton>
              </MDBox>
            )}
          </MDBox>
          {canSearch && (
            <MDBox width={{ xs: "100%", md: "12rem" }} ml={{ md: "auto" }}>
              <MDInput
                placeholder={t("datatable.searchPlaceholder")}
                value={search || ""}
                size="small"
                fullWidth
                onChange={({ currentTarget }) => {
                  setSearch(currentTarget.value);
                }}
              />
            </MDBox>
          )}
        </MDBox>
      ) : null}
      <Table {...getTableProps()}>
        <MDBox component="thead" ref={tableHeadRef}>
          {headerGroups.map((headerGroup, key) => (
            <TableRow key={key} {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((column, idx) => (
                <DataTableHeadCell
                  key={idx}
                  {...column.getHeaderProps(isSorted && column.getSortByToggleProps())}
                  width={column.width || "auto"}
                  align={column.align || "left"}
                  sorted={setSortedValue(column)}
                >
                  {column.render("Header")}
                </DataTableHeadCell>
              ))}
            </TableRow>
          ))}
        </MDBox>
        <TableBody {...getTableBodyProps()}>
          {shouldVirtualize && virtualWindow.topSpacerHeight > 0 ? (
            <TableRow>
              <TableCell
                colSpan={bodyColumnCount}
                sx={{ borderBottom: "none", height: `${virtualWindow.topSpacerHeight}px`, p: 0 }}
              />
            </TableRow>
          ) : null}
          {renderedRows.map((row, key) => (
            <TableRow
              key={row.id || key}
              {...row.getRowProps()}
              sx={shouldVirtualize ? { height: `${virtualizationRowHeight}px` } : undefined}
            >
              {row.cells.map((cell, idx) => (
                <DataTableBodyCell
                  key={idx}
                  noBorder={noEndBorder && renderedRows.length - 1 === key && virtualWindow.bottomSpacerHeight === 0}
                  align={cell.column.align || "left"}
                  {...cell.getCellProps()}
                >
                  {cell.render("Cell")}
                </DataTableBodyCell>
              ))}
            </TableRow>
          ))}
          {shouldVirtualize && virtualWindow.bottomSpacerHeight > 0 ? (
            <TableRow>
              <TableCell
                colSpan={bodyColumnCount}
                sx={{ borderBottom: "none", height: `${virtualWindow.bottomSpacerHeight}px`, p: 0 }}
              />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <MDBox
        display="flex"
        flexDirection={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        p={!showTotalEntries && resolvedPageOptions.length === 1 ? 0 : 3}
      >
        {showTotalEntries && (
          <MDBox mb={{ xs: 3, sm: 0 }}>
            <MDTypography variant="button" color="secondary" fontWeight="regular">
              {t("datatable.showing", {
                start: entriesStart,
                end: entriesEnd,
                total: totalEntries,
                label: totalLabel,
              })}
            </MDTypography>
          </MDBox>
        )}
        {resolvedPageOptions.length > 1 && (
          <MDPagination
            variant={pagination.variant ? pagination.variant : "gradient"}
            color={pagination.color ? pagination.color : "info"}
          >
            {resolvedCanPreviousPage && (
              <MDPagination item onClick={goToPreviousResolvedPage}>
                <Icon sx={{ fontWeight: "bold" }}>chevron_left</Icon>
              </MDPagination>
            )}
            {renderPagination.length > 6 ? (
              <MDBox width="5rem" mx={1}>
                <MDInput
                  inputProps={{ type: "number", min: 1, max: customizedPageOptions.length }}
                  value={customizedPageOptions[resolvedPageIndex]}
                  onChange={handleInputPagination}
                />
              </MDBox>
            ) : (
              renderPagination
            )}
            {resolvedCanNextPage && (
              <MDPagination item onClick={goToNextResolvedPage}>
                <Icon sx={{ fontWeight: "bold" }}>chevron_right</Icon>
              </MDPagination>
            )}
          </MDPagination>
        )}
      </MDBox>
    </TableContainer>
  );
}

DataTable.defaultProps = {
  entriesPerPage: { defaultValue: 10, entries: [5, 10, 15, 20, 25] },
  canSearch: false,
  canExport: true,
  exportFileName: null,
  showTotalEntries: true,
  pagination: { variant: "gradient", color: "info" },
  isSorted: true,
  noEndBorder: false,
  virtualization: false,
  serverPagination: null,
  searchDebounceMs: 220,
};

DataTable.propTypes = {
  entriesPerPage: PropTypes.oneOfType([
    PropTypes.shape({
      defaultValue: PropTypes.number,
      entries: PropTypes.arrayOf(PropTypes.number),
    }),
    PropTypes.bool,
  ]),
  canSearch: PropTypes.bool,
  canExport: PropTypes.bool,
  exportFileName: PropTypes.string,
  showTotalEntries: PropTypes.bool,
  table: PropTypes.objectOf(PropTypes.array).isRequired,
  pagination: PropTypes.shape({
    variant: PropTypes.oneOf(["contained", "gradient"]),
    color: PropTypes.oneOf([
      "primary",
      "secondary",
      "info",
      "success",
      "warning",
      "error",
      "dark",
      "light",
    ]),
  }),
  isSorted: PropTypes.bool,
  noEndBorder: PropTypes.bool,
  searchDebounceMs: PropTypes.number,
  virtualization: PropTypes.oneOfType([
    PropTypes.bool,
    PropTypes.shape({
      enabled: PropTypes.bool,
      maxHeight: PropTypes.number,
      rowHeight: PropTypes.number,
      threshold: PropTypes.number,
      overscan: PropTypes.number,
    }),
  ]),
  serverPagination: PropTypes.shape({
    pageIndex: PropTypes.number.isRequired,
    pageSize: PropTypes.number.isRequired,
    totalEntries: PropTypes.number.isRequired,
    pageCount: PropTypes.number,
    search: PropTypes.string,
    searchDebounceMs: PropTypes.number,
    onPageChange: PropTypes.func,
    onPageSizeChange: PropTypes.func,
    onSearchChange: PropTypes.func,
  }),
};

export default DataTable;
