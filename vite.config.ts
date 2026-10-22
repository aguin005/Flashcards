import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves project sites from a subpath such as /Flashcards/.
// The deploy workflow sets BASE_PATH from the repository name; local dev uses "/".
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  worker: {
    // The PDF.js worker is an ES module, so bundle workers as ES modules too.
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
