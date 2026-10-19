"use client";

import Script from "next/script";

/** Swagger UI over /api/v1/openapi. Public page; the API itself stays session-authenticated. */
export default function ApiDocsPage() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css"
      />
      <div id="swagger-ui" style={{ maxWidth: 1100, margin: "0 auto" }} />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"
        strategy="afterInteractive"
        onReady={() => {
          // @ts-expect-error SwaggerUIBundle is a global provided by the CDN script
          window.SwaggerUIBundle({ url: "/api/v1/openapi", dom_id: "#swagger-ui", deepLinking: true });
        }}
      />
    </>
  );
}
