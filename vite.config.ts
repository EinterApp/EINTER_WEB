import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `npm run dev:local` (mode "docker") sets API_PROXY_TARGET in .env.docker to the local stack
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    base: "/",
    server: {
      proxy: {
        '/api': {
          //target: 'https://einterapi-production.up.railway.app/',
          target: env.API_PROXY_TARGET || 'http://localhost:3000/',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, "/api"),
        },
      },
    },
  };
});
