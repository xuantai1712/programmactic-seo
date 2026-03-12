const itemsPerPage = 12;

module.exports = (data) => {
  // We need to wait for collections to be available, 
  // but global data files run before collections are fully populated.
  // However, we can use a function that Eleventy calls with the full data object.
  
  // Actually, a better way in Eleventy 2.0+ is to use a collection-based pagination.
  // But since we have multi-language, we'll do it manually in the template 
  // by creating a "virtual" data set.
  
  return []; // Placeholder, we'll use a different approach.
};