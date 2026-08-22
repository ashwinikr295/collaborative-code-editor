import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Disable code minification to keep the compiled output readable and verbose
    minify: false,
    // Enable sourcemaps so developers can map compiled JS back to original TSX files in dev tools
    sourcemap: true,
    // Customize Rollup output naming conventions to remove random hash strings from names
    rollupOptions: {
      output: {
        // Name the primary JS entrypoint file cleanly (e.g. assets/index.js)
        entryFileNames: 'assets/[name].js',
        // Name any split code chunks cleanly (e.g. assets/[name].js)
        chunkFileNames: 'assets/[name].js',
        // Name assets like stylesheets cleanly (e.g. assets/index.css)
        assetFileNames: 'assets/[name].[ext]',
      }
    }
  }
})
