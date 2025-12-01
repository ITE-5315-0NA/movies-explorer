// server.js
const express = require('express');
const path = require('path');
const hbs = require('hbs');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
require('dotenv').config();

const Movie = require('./models/Movie'); // Mongoose model

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- MONGOOSE CONNECTION ----------
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
    });
    console.log('✅ MongoDB Atlas connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}
connectDB();

// ---------- VIEW ENGINE (HANDLEBARS) ----------
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

hbs.registerHelper('eq', function (a, b) {
  return a === b;
});

// use layouts/main.hbs with {{{body}}}
app.set('view options', { layout: 'layouts/main' });

// ---------- STATIC FILES ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- BODY PARSING & METHOD OVERRIDE ----------
app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.json());                          // parse JSON for API
app.use(methodOverride('_method'));               // support PUT/DELETE in forms

// ---------- HELPERS TO FLATTEN MOVIE DATA ----------
function mapMovieForCard(movie) {
  const safeTitle =
    typeof movie.title === 'string'
      ? movie.title
      : (typeof movie.original_title === 'string' ? movie.original_title : '');

  const genres = Array.isArray(movie.genres)
    ? movie.genres
        .map(g => (typeof g === 'string' ? g : g?.name))
        .filter(Boolean)
        .slice(0, 3)
        .join(' • ')
    : (typeof movie.genres === 'string' ? movie.genres : '');

  const countries = Array.isArray(movie.production_countries)
    ? movie.production_countries
        .map(c => (typeof c === 'string' ? c : c?.name))
        .filter(Boolean)
        .slice(0, 2)
        .join(', ')
    : (typeof movie.production_countries === 'string' ? movie.production_countries : '');

  const year = movie.release_date
    ? new Date(movie.release_date).getFullYear()
    : '';

  return {
    id: movie.id,
    title: safeTitle,                    
    year,
    poster_url: typeof movie.poster_url === 'string' ? movie.poster_url : '',
    genresText: genres,
    countryText: countries,
    rating: typeof movie.vote_average === 'number'
      ? movie.vote_average.toFixed(1)
      : 'N/A',
    runtimeText: movie.runtime ? `${movie.runtime} min` : '',
    overviewShort: typeof movie.overview === 'string' ? movie.overview : ''
  };
}

function mapMovieForDetail(movie) {
  const card = mapMovieForCard(movie);

  const companiesText = Array.isArray(movie.production_companies)
    ? movie.production_companies.map(c => c?.name).filter(Boolean).join(', ')
    : '';

  const countriesText = Array.isArray(movie.production_countries)
    ? movie.production_countries.map(c => c?.name).filter(Boolean).join(', ')
    : card.countryText;

  const languagesText = Array.isArray(movie.spoken_languages)
    ? movie.spoken_languages.map(l => l?.name).filter(Boolean).join(', ')
    : '';

  return {
    ...card,
    overview: movie.overview,
    release_date: movie.release_date,
    vote_average: movie.vote_average,
    vote_count: movie.vote_count,
    budget: movie.budget,
    revenue: movie.revenue,
    homepage: movie.homepage,
    countriesText,
    languagesText,
    companiesText
  };
}

// ---------- ROUTES ----------

// Home → redirect to listings
app.get('/', (req, res) => {
  res.redirect('/movies');
});

// All listings with search + pagination + genre + rating filters
app.get('/movies', async (req, res) => {
  try {
    const query = req.query.q || '';                // name search
    const genreFilter = req.query.genre || '';      // selected genre
    const minRating = req.query.minRating
      ? Number(req.query.minRating)
      : null;

    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const limit = 30;
    const skip = (page - 1) * limit;

   const baseFilter = {
  poster_url: {
    $type: 'string',
    $ne: ''
  }
};

    const andConditions = [];

    if (query) {
      andConditions.push({
        title: { $regex: query, $options: 'i' }
      });
    }

   if (genreFilter) {
  andConditions.push({
    'genres.name': { $regex: genreFilter, $options: 'i' }
  });
}


   if (minRating !== null && !Number.isNaN(minRating)) {
      andConditions.push({
        vote_average: { $gte: minRating }
      });
    }


    if (andConditions.length > 0) {
      baseFilter.$and = andConditions;
    }

    const [moviesRaw, totalCount] = await Promise.all([
      Movie.find(baseFilter)
        .sort({ popularity: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Movie.countDocuments(baseFilter)
    ]);

    const moviesMapped = moviesRaw.map(mapMovieForCard);

    // Keep only movies with both a title and a non-empty poster_url string
    const movies = moviesMapped.filter(
      m => typeof m.title === 'string' && m.title.trim() !== '' &&
           typeof m.poster_url === 'string' && m.poster_url.trim() !== ''
    );

    const totalPages = Math.ceil(totalCount / limit);

    const allGenres = [
      'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
      'Documentary', 'Drama', 'Family', 'Fantasy', 'History',
      'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction',
      'TV Movie', 'Thriller', 'War', 'Western'
    ];

    res.render('movies', {
      title: 'All Movies',
      movies,
      totalMovies: totalCount,
      query,
      genre: genreFilter,
      minRating: req.query.minRating || '',
      currentPage: page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : 1,
      nextPage: page < totalPages ? page + 1 : totalPages,
      genres: allGenres
    });
  } catch (err) {
    console.error('Error loading movies:', err);
    res.status(500).send('Server error');
  }
});

// Single movie detail page
app.get('/movie/:id', async (req, res) => {
  try {
    const id = Number(req.params.id); // TMDB numeric id

    const movieRaw = await Movie.findOne({ id }).lean();
    if (!movieRaw) {
      return res.status(404).render('error', {
        title: 'Not found',
        message: 'Movie not found'
      });
    }

    const movie = mapMovieForDetail(movieRaw);

    res.render('movie-detail', {
      title: movie.title,
      ...movie
    });
  } catch (err) {
    console.error('Error loading movie detail:', err);
    res.status(500).send('Server error');
  }
});

// Show edit form
app.get('/movie/:id/edit', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const movieRaw = await Movie.findOne({ id }).lean();
    if (!movieRaw) {
      return res.status(404).render('error', {
        title: 'Not found',
        message: 'Movie not found'
      });
    }

    res.render('movie-edit', {
      mode: 'edit',
      movie: movieRaw
    });
  } catch (err) {
    console.error('Error loading edit form:', err);
    res.status(500).send('Server error');
  }
});

// Handle edit submit (update)
app.put('/movie/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    await Movie.updateOne(
      { id },
      {
        title: req.body.title,
        overview: req.body.overview,
        poster_url: req.body.poster_url,
        runtime: Number(req.body.runtime) || null,
        release_date: req.body.release_date || null
        // add other fields you allow editing
      }
    );

    res.redirect(`/movie/${id}`);
  } catch (err) {
    console.error('Error updating movie:', err);
    res.status(500).send('Server error');
  }
});

// Handle delete
app.delete('/movie/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await Movie.deleteOne({ id });
    res.redirect('/movies');
  } catch (err) {
    console.error('Error deleting movie:', err);
    res.status(500).send('Server error');
  }
});

// Show create form
app.get('/movies/new', (req, res) => {
  res.render('movie-edit', {
    mode: 'create',
    movie: {}
  });
});

// Handle create submit (from form)
app.post('/movies', async (req, res) => {
  try {
    const movieData = {
      id: Number(req.body.id),
      title: req.body.title,
      poster_url: req.body.poster_url,
      overview: req.body.overview,
      vote_average: req.body.vote_average ? Number(req.body.vote_average) : null,
      runtime: req.body.runtime ? Number(req.body.runtime) : null,
      release_date: req.body.release_date || null,

      // satisfy required schema fields
      budget: req.body.budget ? Number(req.body.budget) : 0,
      adult: req.body.adult === 'on' || req.body.adult === 'true' ? true : false
    };

    const movie = new Movie(movieData);
    await movie.save();

    res.redirect(`/movie/${movie.id}`);
  } catch (err) {
    console.error('Error creating movie:', err);
    res.status(400).render('error', {
      title: 'Create failed',
      message: `Could not create movie: ${err.message}`
    });
  }
});



// ---------- JSON API ROUTES ----------

// GET /api/movies  -> list with pagination + search + genre + rating
app.get('/api/movies', async (req, res) => {
  try {
    const q = req.query.q || '';
    const genreFilter = req.query.genre || '';
    const minRating = req.query.minRating
      ? Number(req.query.minRating)
      : null;

    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const perPage = parseInt(req.query.perPage) > 0 ? parseInt(req.query.perPage) : 10;
    const skip = (page - 1) * perPage;

    const baseFilter = {
      poster_url: {
        $type: 'string',
        $regex: '^https://image\\.tmdb\\.org',
        $options: 'i'
      }
    };

    const andConditions = [];

    if (q) {
      andConditions.push({
        title: { $regex: q, $options: 'i' }
      });
    }

    if (genreFilter) {
  andConditions.push({
    'genres.name': { $regex: genreFilter, $options: 'i' }
  });
}


    if (minRating !== null) {
      andConditions.push({
        vote_average: { $gte: minRating }
      });
    }

    if (andConditions.length > 0) {
      baseFilter.$and = andConditions;
    }

    const [items, totalCount] = await Promise.all([
      Movie.find(baseFilter)
        .sort({ popularity: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Movie.countDocuments(baseFilter)
    ]);

    const totalPages = Math.ceil(totalCount / perPage);

    res.json({
      page,
      perPage,
      totalPages,
      totalCount,
      data: items
    });
  } catch (err) {
    console.error('Error in GET /api/movies:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/movies/:id  -> single movie
app.get('/api/movies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const movie = await Movie.findOne({ id }).lean();
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(movie);
  } catch (err) {
    console.error('Error in GET /api/movies/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/movies  -> create new movie
app.post('/api/movies', async (req, res) => {
  try {
    const movie = new Movie(req.body);
    await movie.save();
    res.status(201).json(movie);
  } catch (err) {
    console.error('Error in POST /api/movies:', err);
    res.status(400).json({ error: 'Invalid data', details: err.message });
  }
});

// PUT /api/movies/:id  -> update movie
app.put('/api/movies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await Movie.findOneAndUpdate(
      { id },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error in PUT /api/movies/:id:', err);
    res.status(400).json({ error: 'Invalid data', details: err.message });
  }
});

// DELETE /api/movies/:id  -> delete movie
app.delete('/api/movies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await Movie.deleteOne({ id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/movies/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not found',
    message: 'Page not found'
  });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🎬 Movies app running at http://localhost:${PORT}`);
});
