import { translate } from "./index";

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
});
