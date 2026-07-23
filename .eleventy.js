module.exports = function (eleventyConfig) {
  // Copia directa de recursos estáticos (sin procesar)
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/fonts");
  eleventyConfig.addPassthroughCopy("src/bat");
  eleventyConfig.addPassthroughCopy("src/admin");
  eleventyConfig.addPassthroughCopy("src/legal");

  // Colección de noticias, ordenadas de más reciente a más antigua
  eleventyConfig.addCollection("noticiasOrdenadas", function (collectionApi) {
    return collectionApi.getFilteredByTag("noticias").sort((a, b) => b.date - a.date);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["html", "njk", "md"],
  };
};
