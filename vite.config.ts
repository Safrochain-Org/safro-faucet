
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      host: "::",
      port: parseInt(env.VITE_PORT || process.env.VITE_PORT || "8080", 10),
      strictPort: true,
    },
    preview: {
      host: "0.0.0.0",
      port: parseInt(env.VITE_PREVIEW_PORT || env.VITE_PORT || process.env.VITE_PREVIEW_PORT || process.env.VITE_PORT || "4173", 10),
      strictPort: true,
      allowedHosts: ["faucet.safrochain.com", "faucet.cardanotask.com"],
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
