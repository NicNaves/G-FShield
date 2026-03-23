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

import { isValidElement, useMemo, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTable, usePagination, useGlobalFilter, useAsyncDebounce, useSortBy } from "react-table";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
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
}) {
  const { t } = useI18n();
  const defaultValue = entriesPerPage.defaultValue ? entriesPerPage.defaultValue : 10;
  const entries = entriesPerPage.entries
    ? entriesPerPage.entries.map((entry) => entry.toString())
    : ["5", "10", "15", "20", "25"];
  const columns = useMemo(() => table.columns, [table]);
  const data = useMemo(() => table.rows, [table]);

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
    state: { pageIndex, pageSize, globalFilter },
  } = tableInstance;

  useEffect(() => {
    setPageSize(defaultValue || 10);
  }, [defaultValue, setPageSize]);

  const setEntriesPerPage = (value) => setPageSize(value);

  const leafColumns = useMemo(() => headerGroups[headerGroups.length - 1]?.headers || [], [headerGroups]);

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

  const renderPagination = pageOptions.map((option) => (
    <MDPagination
      item
      key={option}
      onClick={() => gotoPage(Number(option))}
      active={pageIndex === option}
    >
      {option + 1}
    </MDPagination>
  ));

  const handleInputPagination = ({ target: { value } }) => {
    const nextPageIndex = Number(value) - 1;
    if (Number.isNaN(nextPageIndex) || nextPageIndex < 0 || nextPageIndex >= pageOptions.length) {
      gotoPage(0);
      return;
    }

    gotoPage(nextPageIndex);
  };

  const customizedPageOptions = pageOptions.map((option) => option + 1);

  const [search, setSearch] = useState(globalFilter);

  const onSearchChange = useAsyncDebounce((value) => {
    setGlobalFilter(value || undefined);
  }, 100);

  const setSortedValue = (column) => {
    if (!isSorted) {
      return false;
    }

    if (column.isSorted) {
      return column.isSortedDesc ? "desc" : "asce";
    }

    return "none";
  };

  const totalEntries = rows.length;
  const entriesStart = totalEntries === 0 ? 0 : pageIndex * pageSize + 1;
  const entriesEnd = totalEntries === 0 ? 0 : Math.min(totalEntries, pageSize * (pageIndex + 1));
  const totalLabel = totalEntries === 1 ? t("datatable.itemSingular") : t("datatable.itemPlural");
  const hasToolbar = entriesPerPage || canSearch || canExport;

  return (
    <TableContainer sx={{ boxShadow: "none" }}>
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
                value={pageSize.toString()}
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
                  onSearchChange(currentTarget.value);
                }}
              />
            </MDBox>
          )}
        </MDBox>
      ) : null}
      <Table {...getTableProps()}>
        <MDBox component="thead">
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
          {page.map((row, key) => {
            prepareRow(row);
            return (
              <TableRow key={key} {...row.getRowProps()}>
                {row.cells.map((cell, idx) => (
                  <DataTableBodyCell
                    key={idx}
                    noBorder={noEndBorder && page.length - 1 === key}
                    align={cell.column.align || "left"}
                    {...cell.getCellProps()}
                  >
                    {cell.render("Cell")}
                  </DataTableBodyCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <MDBox
        display="flex"
        flexDirection={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        p={!showTotalEntries && pageOptions.length === 1 ? 0 : 3}
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
        {pageOptions.length > 1 && (
          <MDPagination
            variant={pagination.variant ? pagination.variant : "gradient"}
            color={pagination.color ? pagination.color : "info"}
          >
            {canPreviousPage && (
              <MDPagination item onClick={() => previousPage()}>
                <Icon sx={{ fontWeight: "bold" }}>chevron_left</Icon>
              </MDPagination>
            )}
            {renderPagination.length > 6 ? (
              <MDBox width="5rem" mx={1}>
                <MDInput
                  inputProps={{ type: "number", min: 1, max: customizedPageOptions.length }}
                  value={customizedPageOptions[pageIndex]}
                  onChange={handleInputPagination}
                />
              </MDBox>
            ) : (
              renderPagination
            )}
            {canNextPage && (
              <MDPagination item onClick={() => nextPage()}>
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
};

export default DataTable;
