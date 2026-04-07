import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = dirname(fileURLToPath(import.meta.url));

const entries = {
    index: resolve(__dirname, "index.html"),
    main: resolve(__dirname, "main.html"),
    side: resolve(__dirname, "side.html"),
};

const entry = process.env.VITE_ENTRY || "index";

export default defineConfig({
    plugins: [react(), tailwindcss(), viteSingleFile()],
    build: {
        rollupOptions: {
            input: entries[entry],
        },
        emptyOutDir: entry === "index",
    },
    server: {
        proxy: {
            "/public/neo-pkg-opcua-client": "http://localhost:5654",
        },
    },
});
