import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return [{ source: "/profile", destination: "/settings", permanent: false }];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default withEve(nextConfig);
