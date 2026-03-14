import { useMemo } from "react";

import { useMaterialUIController, setLocale as setLocaleInContext } from "context";
import { translate } from "i18n";

export default function useI18n() {
  const [controller, dispatch] = useMaterialUIController();
  const locale = controller.locale;

  const value = useMemo(
    () => ({
      locale,
      t: (key, params) => translate(locale, key, params),
      setLocale: (nextLocale) => setLocaleInContext(dispatch, nextLocale),
    }),
    [dispatch, locale]
  );

  return value;
}
