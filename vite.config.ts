import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, PluginOption } from "vite";
import { fileURLToPath } from "node:url";

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const configDir = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = process.env.PROJECT_ROOT || configDir

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (empty prefix) so SUPABASE_URL / SUPABASE_ANON_KEY are
  // available from .env.local without an explicit VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || "/"

  return {
    base: basePath.endsWith("/") ? basePath : `${basePath}/`,
    // Only VITE_* vars are exposed via import.meta.env through envPrefix.
    // SUPABASE_URL and SUPABASE_ANON_KEY are explicitly injected below via
    // `define` so that SUPABASE_SERVICE_ROLE_KEY is never bundled into the
    // browser output.
    envPrefix: ["VITE_"],
    define: {
      'import.meta.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
      'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
    plugins: [
      react(),
      tailwindcss(),
      // DO NOT REMOVE
      createIconImportProxy() as PluginOption,
      sparkPlugin() as PluginOption,
    ],
    resolve: {
      alias: {
        '@': resolve(projectRoot, 'src')
      }
    },
  };
});
