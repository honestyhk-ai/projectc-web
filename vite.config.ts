import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: GitHub Pages 프로젝트 사이트(https://<user>.github.io/<repo>/)에서
// 자산 경로가 깨지지 않도록 상대 경로('./') 사용. HashRouter와 함께 동작.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
