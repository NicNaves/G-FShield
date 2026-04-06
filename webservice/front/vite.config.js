import { defineConfig, loadEnv, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const usePolling = env.CHOKIDAR_USEPOLLING === "true";
  const watchInterval = Number(env.CHOKIDAR_INTERVAL || 1000);
  const clientEnv = {
    ...Object.fromEntries(
      Object.entries(env).filter(([key]) => key.startsWith("REACT_APP_"))
    ),
    NODE_ENV: mode,
  };

  const jsxInJsPlugin = {
    name: "gfshield-jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      if (!/[\\/]+src[\\/].*\.js$/.test(id)) {
        return null;
      }

      return transformWithOxc(code, id, {
        lang: "jsx",
        jsx: {
          runtime: "automatic",
          importSource: "react",
        },
      });
    },
  };

  return {
    plugins: [jsxInJsPlugin, react({ include: /\.(js|jsx|ts|tsx)$/ })],
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      rolldownOptions: {
        moduleTypes: {
          ".js": "jsx",
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      watch: {
        usePolling,
        interval: Number.isFinite(watchInterval) ? watchInterval : 1000,
        ignored: ["**/build/**", "**/.tmp-*/**"],
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
    },
    build: {
      outDir: "build",
      sourcemap: mode !== "production",
    },
    define: {
      "process.env": clientEnv,
    },
  };
});
