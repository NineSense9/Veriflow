import type { NextConfig } from "next";
import path from "path";

const apiOrigin = process.env.VERIFLOW_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ["monaco-editor", "@monaco-editor/react", "@xyflow/react"],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
