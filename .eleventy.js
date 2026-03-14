require("dotenv").config();
const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {
  const includesDir = path.join(__dirname, "src", "_includes");
  const affiliatePath = path.join(includesDir, "affiliate-block.njk");
  const adsensePath = path.join(includesDir, "adsense-snippet.njk");

  let affiliateHTML = "";
  let adsenseHTML = "";
  try {
    affiliateHTML = fs.readFileSync(affiliatePath, "utf8");
  } catch {}
  try {
    adsenseHTML = fs.readFileSync(adsensePath, "utf8");
  } catch {}

  function injectBlocks(html) {
    if (!html || typeof html !== "string") return html;
    let out = html;

    let finalAffiliateHTML = (affiliateHTML || "").replace(/\{\{ADSENSE_CLIENT\}\}/g, process.env.ADSENSE_CLIENT || "");
    let finalAdsenseHTML = (adsenseHTML || "").replace(/\{\{ADSENSE_CLIENT\}\}/g, process.env.ADSENSE_CLIENT || "");

    if (out.includes("<!-- AFFILIATE_PLACEHOLDER -->")) {
      out = out.replace("<!-- AFFILIATE_PLACEHOLDER -->", finalAffiliateHTML);
    } else {
      let idx = -1;
      let count = 0;
      for (let i = 0; i < out.length - 4; i++) {
        if (out.slice(i, i + 4) === "</p>") {
          count++;
          if (count === 3) {
            idx = i + 4;
            break;
          }
        }
      }
      if (idx !== -1) {
        out = out.slice(0, idx) + finalAffiliateHTML + out.slice(idx);
      }
    }

    if (finalAdsenseHTML) {
      const bodyClose = out.lastIndexOf("</body>");
      if (bodyClose !== -1) {
        out = out.slice(0, bodyClose) + finalAdsenseHTML + "\n" + out.slice(bodyClose);
      } else {
        out = out + "\n" + finalAdsenseHTML;
      }
    }
    return out;
  }

  eleventyConfig.addFilter("injectMonetization", injectBlocks);
  eleventyConfig.addFilter("date", (value, fmt) => {
    let d;
    if (!value || value === "now") {
      d = new Date();
    } else {
      d = new Date(value);
      if (isNaN(d)) d = new Date();
    }
    if (fmt === "yyyy") return String(d.getFullYear());
    if (fmt === "yyyy-MM-dd") return d.toISOString().slice(0, 10);
    return d.toISOString();
  });

  eleventyConfig.addFilter("filterByLang", (collection, lang) => {
    return collection.filter((item) => item.data.lang === lang);
  });

  eleventyConfig.addCollection("pagedArticles", (collectionApi) => {
    const allArticles = collectionApi.getFilteredByGlob("src/pages/**/*.md").reverse();
    const itemsPerPage = 12;
    const languages = ["vi", "en"];
    const paged = [];

    languages.forEach((lang) => {
      const langArticles = allArticles.filter((item) => item.data.lang === lang);
      const totalPages = Math.ceil(langArticles.length / itemsPerPage);

      for (let i = 0; i < totalPages; i++) {
        paged.push({
          lang,
          pageNumber: i,
          totalPages,
          items: langArticles.slice(i * itemsPerPage, (i + 1) * itemsPerPage),
        });
      }
    });

    return paged;
  });

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("src/*.html");
  eleventyConfig.addPassthroughCopy("src/CNAME");

  eleventyConfig.addTransform("inject-monetization", function (content, outputPath) {
    if (outputPath && outputPath.endsWith(".html")) {
      return injectBlocks(content);
    }
    return content;
  });

  const PREVIEW = process.env.PREVIEW === "true";
  if (!PREVIEW) {
    if (!process.env.SITE_URL || !process.env.SITE_URL.trim()) {
      throw new Error("Missing required env: SITE_URL");
    }
  }

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"],
  };
};
