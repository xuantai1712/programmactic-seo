module.exports = {
  name: "AiOps Bridge",
  url: process.env.SITE_URL || "https://aiopsbridge.com",
  googleVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
  preview: process.env.PREVIEW === "true"
};