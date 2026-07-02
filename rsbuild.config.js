// @ts-check
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@rsbuild/core';

// Docs: https://rsbuild.rs/config/
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/block-blink/' : '/';
const siteUrl = 'https://josepdecid.github.io/block-blink';
const siteName = 'Block Blink';
const siteDescription =
  'Test your visual memory — watch a brief flash of isometric blocks, then recall the exact count before time runs out.';

function createWebManifestPlugin() {
  return {
    name: 'web-manifest',
    setup(api) {
      api.onAfterBuild(() => {
        const manifest = {
          name: siteName,
          short_name: siteName,
          icons: [
            {
              src: `${basePath}favicon/android-chrome-192x192.png`,
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `${basePath}favicon/android-chrome-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
            },
          ],
          theme_color: '#0a1020',
          background_color: '#0a1020',
          display: 'standalone',
        };
        const outDir = join(api.context.distPath, 'favicon');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
          join(outDir, 'site.webmanifest'),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [createWebManifestPlugin()],
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
      basePath,
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
