import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import { copyFileSync } from "fs";

export default defineConfig({
    plugins: [
        svelte(),
        {
            name: "copy-manifest",
            writeBundle() {
                copyFileSync(
                    resolve(__dirname, "src/manifest.json"),
                    resolve(__dirname, "dist/manifest.json"),
                );
            },
        },
    ],
    base: "",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
                content: resolve(__dirname, "src/content/collector.ts"),
                popup: resolve(__dirname, "src/popup/popup.html"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
            },
        },
    },
});
