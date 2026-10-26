import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          loaders: ["three/addons/loaders/GLTFLoader.js"],
        },
      },
    },
  },
});
