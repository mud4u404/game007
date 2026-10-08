import { defineConfig } from 'vite';

// base 用相对路径，这样部署到 GitHub Pages 的子路径下也能正常加载
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      input: { main: 'index.html', lab: 'lab.html', demo: 'demo.html' }
    }
  }
});
