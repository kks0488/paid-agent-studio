const config = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com https://www.paypalobjects.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.paypalobjects.com https://www.paypal.com; connect-src 'self' https://*.paypal.com https://*.paypalobjects.com; frame-src https://*.paypal.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
