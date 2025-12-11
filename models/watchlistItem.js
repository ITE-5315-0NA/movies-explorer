const mongoose = require('mongoose');

const watchlistItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movieId: { type: Number, required: true },          // TMDB id
  movieTitle: { type: String, required: true },
  poster_url: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('WatchlistItem', watchlistItemSchema);
