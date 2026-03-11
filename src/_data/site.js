module.exports = {
  name: "Anonymous Programmatic SEO",
  url: process.env.SITE_URL || "https://aiopsbridge.com",
  googleVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
  preview: process.env.PREVIEW === "true",
  affiliate: {
    baseUrl: process.env.AFFILIATE_BASE_URL || "",
    defaultCode: process.env.AFFILIATE_CODE || "",
  },
  adsense: {
    client: process.env.ADSENSE_CLIENT || "",
    slot: process.env.ADSENSE_SLOT || "",
  },
};
