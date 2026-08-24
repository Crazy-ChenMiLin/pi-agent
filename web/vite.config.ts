import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Streamdown carries a syntax highlighter and a diagram renderer. They
        // belong in their own chunk: the shell should paint without waiting on
        // either, and they change far less often than the app does.
        manualChunks: {
          markdown: ["streamdown"],
        },
      },
    },
  },
  plugins: [react()],
  server: { port: 5190, proxy: { "/api": "http://localhost:4100" } },
});
