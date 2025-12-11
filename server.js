// server.js
const express = require('express');
const path = require('path');
const hbs = require('hbs');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
require('dotenv').config();

const Movie = require('./models/movie');        // Movie model
const User = require('./models/user');          // User model
const WatchlistItem = require('./models/watchlistItem');
const Review = require('./models/review');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const auth = require('./middleware/auth');      // auth middleware

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- MONGOOSE CONNECTION ----------
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {});
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
app.use(express.json());                         // parse JSON for API
app.use(methodOverride('_method'));              // support PUT/DELETE in forms

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

// ---------- AUTH ROUTES (JWT) ----------

// Render register form
app.get('/auth/register', (req, res) => {
  res.render('auth-register', { title: 'Register' });
});

// Render login form
app.get('/auth/login', (req, res) => {
  res.render('auth-login', { title: 'Login' });
});

// Register user
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = new User({ email, password, role });
    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login user
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const payload = { id: user._id, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    });

    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PAGE ROUTES ----------

// Home → redirect to listings
app.get('/', (req, res) => {
  res.redirect('/movies');
});

// All listings with search + pagination + genre + rating filters
app.get('/movies', async (req, res) => {
  try {
    const query = req.query.q || '';               // name search
    const genreFilter = req.query.genre || '';     // selected genre
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

// Watchlist page (HTML shell; data loaded via JS + API)
app.get('/watchlist', (req, res) => {
  res.render('watchlist', { title: 'My Watchlist' });
});

// ---------- JSON API ROUTES: MOVIES (READ ONLY) ----------

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

// ---------- JSON API ROUTES: WATCHLIST (USER CRUD) ----------

// ADD to watchlist (Create)
app.post('/api/watchlist', auth(), async (req, res) => {
  try {
    const { movieId, movieTitle, poster_url, status } = req.body;
    const item = new WatchlistItem({
      user: req.user.id,
      movieId,
      movieTitle,
      poster_url,
      status: status || 'planned'
    });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    console.error('Error in POST /api/watchlist:', err);
    res.status(400).json({ error: 'Invalid data', details: err.message });
  }
});

// GET my watchlist (Read)
app.get('/api/watchlist', auth(), async (req, res) => {
  try {
    const items = await WatchlistItem.find({ user: req.user.id }).lean();
    res.json(items);
  } catch (err) {
    console.error('Error in GET /api/watchlist:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE watchlist item (Delete)
app.delete('/api/watchlist/:id', auth(), async (req, res) => {
  try {
    const result = await WatchlistItem.deleteOne({
      _id: req.params.id,
      user: req.user.id
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/watchlist/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- JSON API ROUTES: REVIEWS (USER CRUD) ----------

// CREATE review
app.post('/api/movies/:id/reviews', auth(), async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const review = new Review({
      user: req.user.id,
      movieId: Number(req.params.id),
      rating,
      comment
    });
    await review.save();
    res.status(201).json(review);
  } catch (err) {
    console.error('Error in POST /api/movies/:id/reviews:', err);
    res.status(400).json({ error: 'Invalid data', details: err.message });
  }
});

// READ reviews for a movie
app.get('/api/movies/:id/reviews', async (req, res) => {
  try {
    const movieId = Number(req.params.id);
    const reviews = await Review.find({ movieId })
      .populate('user', 'email')
      .lean();
    res.json(reviews);
  } catch (err) {
    console.error('Error in GET /api/movies/:id/reviews:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE my review
app.put('/api/reviews/:id', auth(), async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const updated = await Review.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { rating, comment },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error in PUT /api/reviews/:id:', err);
    res.status(400).json({ error: 'Invalid data', details: err.message });
  }
});

// DELETE my review
app.delete('/api/reviews/:id', auth(), async (req, res) => {
  try {
    const result = await Review.deleteOne({
      _id: req.params.id,
      user: req.user.id
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/reviews/:id:', err);
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

// Export for Vercel serverless
module.exports = app;

// Local development only
if (require.main === module) {
  const PORT_LOCAL = process.env.PORT || 3000;
  app.listen(PORT_LOCAL, () => {
    console.log(`🎬 Running locally at http://localhost:${PORT_LOCAL}`);
  });
}
