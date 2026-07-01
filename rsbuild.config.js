// @ts-check
import { defineConfig } from '@rsbuild/core';

// Docs: https://rsbuild.rs/config/
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const siteUrl = 'https://josepdecid.github.io/block-blink';
const siteName = 'Block Blink';
const siteDescription =
  'Test your visual memory — watch a brief flash of isometric blocks, then recall the exact count before time runs out.';

export default defineConfig({
  output: {
    assetPrefix: isGitHubPages ? '/block-blink/' : '/',
  },
  source: {
    entry: {
      index: './src/index.js',
    },
  },
  html: {
    template: './index.html',
    templateParameters: {
      siteUrl,
      siteName,
      siteDescription,
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  dev: {
    liveReload: true,
  },
});
