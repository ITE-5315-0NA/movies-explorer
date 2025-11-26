const mongoose = require('mongoose');

// Nested schema for genres
const genreSchema = new mongoose.Schema({
  id: Number,
  name: String
}, { _id: false });

// Nested schema for production companies
const productionCompanySchema = new mongoose.Schema({
  id: Number,
  name: String
}, { _id: false });

// Nested schema for production countries
const productionCountrySchema = new mongoose.Schema({
  iso_3166_1: String,
  name: String
}, { _id: false });

// Nested schema for spoken languages
const spokenLanguageSchema = new mongoose.Schema({
  iso_639_1: String,
  name: String
}, { _id: false });

// Nested schema for collection
const collectionSchema = new mongoose.Schema({
  id: Number,
  name: String,
  poster_path: String,
  backdrop_path: String
}, { _id: false });

// Main Movie Schema
const movieSchema = new mongoose.Schema({
  adult: { type: Boolean, required: true },
  belongs_to_collection: { type: collectionSchema, default: null },
  budget: { type: Number, required: true },
  genres: { type: [genreSchema], default: [] },
  id: { type: Number, required: true, unique: true },
  imdb_id: { type: String, unique: true },
  original_language: { type: String },
  original_title: { type: String },
  overview: { type: String },
  popularity: { type: Number },
  poster_path: { type: String },
  poster_url: { type: String }, // your added image field
  homepage: { type: String },
  production_companies: { type: [productionCompanySchema], default: [] },
  production_countries: { type: [productionCountrySchema], default: [] },
  release_date: { type: Date },
  revenue: { type: Number },
  runtime: { type: Number },
  spoken_languages: { type: [spokenLanguageSchema], default: [] },
  status: { type: String },
  tagline: { type: String },
  title: { type: String },
  video: { type: Boolean, default: false },
  vote_average: { type: Number },
  vote_count: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Movie', movieSchema);
