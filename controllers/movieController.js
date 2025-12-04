const Movie = require("../models/movie");

// GET PAGINATED MOVIES
exports.getPaginatedMovies = async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  const limit = 20;

  try {
    const totalMovies = await Movie.countDocuments();
    const totalPages = Math.ceil(totalMovies / limit);

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    const movies = await Movie.find()
      .skip((page - 1) * limit)
      .limit(limit);

    res.render("movies", {
      movies,
      currentPage: page,
      totalPages,
      pagination: buildPagination(page, totalPages),
    });
  } catch (err) {
    res.status(500).send("Server Error: " + err.message);
  }
};

// BUILD PAGINATION BUTTONS
function buildPagination(currentPage, totalPages) {
  const pages = [];
  const maxButtons = 5;

  let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let end = Math.min(totalPages, start + maxButtons - 1);

  if (end - start < maxButtons - 1) {
    start = Math.max(1, end - maxButtons + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push({ number: i, isCurrent: i === currentPage });
  }

  return pages;
}
