import PropTypes from "prop-types";

import Stack from "@mui/material/Stack";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";

function FeedTableToolbarFilters({ idPrefix, algorithmOptions, filters, onChange }) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1} useFlexGap flexWrap="wrap">
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id={`${idPrefix}-algorithm-label`}>Algorithm</InputLabel>
        <Select
          labelId={`${idPrefix}-algorithm-label`}
          value={filters.algorithm}
          label="Algorithm"
          onChange={(event) => onChange({ algorithm: event.target.value })}
        >
          <MenuItem value="all">All algorithms</MenuItem>
          {algorithmOptions.map((algorithm) => (
            <MenuItem key={algorithm} value={algorithm}>
              {algorithm}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small"
        type="number"
        label="Min F1"
        value={filters.minF1Score}
        onChange={(event) => onChange({ minF1Score: event.target.value })}
        inputProps={{ min: 0, max: 100, step: 0.01 }}
        sx={{ minWidth: 120 }}
      />

      <TextField
        size="small"
        type="number"
        label="Max F1"
        value={filters.maxF1Score}
        onChange={(event) => onChange({ maxF1Score: event.target.value })}
        inputProps={{ min: 0, max: 100, step: 0.01 }}
        sx={{ minWidth: 120 }}
      />
    </Stack>
  );
}

FeedTableToolbarFilters.propTypes = {
  idPrefix: PropTypes.string,
  algorithmOptions: PropTypes.arrayOf(PropTypes.string),
  filters: PropTypes.shape({
    algorithm: PropTypes.string,
    minF1Score: PropTypes.string,
    maxF1Score: PropTypes.string,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};

FeedTableToolbarFilters.defaultProps = {
  idPrefix: "feed-table-filter",
  algorithmOptions: [],
};

export default FeedTableToolbarFilters;
