import type { NextConfig } from "next";
import CopyPlugin from "copy-webpack-plugin";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Fixes an error in the build process when using pnpm + prisma-extension-kysely.
    // The turbopack warning can be safely ignored. This is a workaround.
    if (isServer) {
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: "generated/prisma",
              to: "generated/prisma",
            },
          ],
        })
      );
    }
    return config;
  },
};

export default nextConfig;
