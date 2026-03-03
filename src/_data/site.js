module.exports = {
  name: "Anonymous Programmatic SEO",
  url: process.env.SITE_URL || "",
  affiliate: {
    baseUrl: process.env.AFFILIATE_BASE_URL || "",
    defaultCode: process.env.AFFILIATE_CODE || "",
  },
  adsense: {
    client: process.env.ADSENSE_CLIENT || "",
    slot: process.env.ADSENSE_SLOT || "",
  },
};
