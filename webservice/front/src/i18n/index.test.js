import translations, { translate } from "./index";

const flattenTranslations = (dictionary, prefix = "", entries = {}) => {
  Object.entries(dictionary || {}).forEach(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenTranslations(value, nextPath, entries);
      return;
    }

    entries[nextPath] = value;
  });

  return entries;
};

describe("i18n translations", () => {
  it("returns english text by default", () => {
    expect(translate("en-US", "datatable.itemsPerPage")).toBe("items per page");
  });

  it("returns portuguese text for supported keys", () => {
    expect(translate("pt-BR", "datatable.itemsPerPage")).toBe("itens por pagina");
  });

  it("interpolates parameters", () => {
    expect(
      translate("en-US", "datatable.showing", {
        start: 1,
        end: 4,
        total: 4,
        label: "items",
      })
    ).toBe("Showing 1 to 4 of 4 items");
  });

  it("keeps the same translation key set in english and portuguese", () => {
    const englishKeys = Object.keys(flattenTranslations(translations["en-US"])).sort();
    const portugueseKeys = Object.keys(flattenTranslations(translations["pt-BR"])).sort();

    expect(portugueseKeys).toEqual(englishKeys);
  });
});
