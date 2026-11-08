const express = require('express');
const cors = require('cors');
const { initializeDB, getDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Whitelisted sorting columns and directions to prevent SQL Injection
const ALLOWED_ORDER_BY = ['id', 'title', 'author', 'price'];
const ALLOWED_ORDER = ['ASC', 'DESC'];

// Global Middlewares
app.use(cors());
app.use(express.json());

// Handle malformed JSON request bodies with a uniform 400 response
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Malformed JSON payload in request body' });
  }
  next(err);
});

/**
 * Validation Middleware for POST and PUT request bodies.
 * Validates constraints before touching the database:
 * - title: non-empty string
 * - author: non-empty string
 * - price: non-negative number
 */
const validateBookPayload = (req, res, next) => {
  const { title, author, price } = req.body;

  if (title === undefined || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ message: 'Title is required and must be a non-empty string' });
  }

  if (author === undefined || typeof author !== 'string' || author.trim() === '') {
    return res.status(400).json({ message: 'Author is required and must be a non-empty string' });
  }

  if (price === undefined || typeof price !== 'number' || isNaN(price) || price < 0) {
    return res.status(400).json({ message: 'Price is required and must be a non-negative number' });
  }

  next();
};

// ----------------------------------------------------
// REST API ROUTES (/books)
// ----------------------------------------------------

/**
 * GET /books
 * List, search, filter, paginate, and sort books.
 * Query Parameters:
 *  - search_q: partial title match (default: "")
 *  - order_by: id | title | author | price (default: "id")
 *  - order: ASC | DESC (default: "ASC")
 *  - limit: number of records (default: 10)
 *  - offset: number of records to skip (default: 0)
 *  - min_price: minimum book price filter
 *  - max_price: maximum book price filter
 */
app.get('/books', async (req, res, next) => {
  try {
    const db = getDB();
    const {
      search_q = '',
      order_by = 'id',
      order = 'ASC',
      limit = '10',
      offset = '0',
      min_price,
      max_price,
    } = req.query;

    // 1. Validate and whitelist order_by
    const normalizedOrderBy = String(order_by).toLowerCase();
    if (!ALLOWED_ORDER_BY.includes(normalizedOrderBy)) {
      return res.status(400).json({
        message: 'Invalid order_by parameter. Allowed values: id, title, author, price',
      });
    }

    // 2. Validate and whitelist order
    const normalizedOrder = String(order).toUpperCase();
    if (!ALLOWED_ORDER.includes(normalizedOrder)) {
      return res.status(400).json({
        message: 'Invalid order parameter. Allowed values: ASC, DESC',
      });
    }

    // 3. Validate pagination parameters (limit & offset)
    const parsedLimit = Number(limit);
    if (isNaN(parsedLimit) || !Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({
        message: 'Invalid limit parameter. Must be a positive integer',
      });
    }

    const parsedOffset = Number(offset);
    if (isNaN(parsedOffset) || !Number.isInteger(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        message: 'Invalid offset parameter. Must be a non-negative integer',
      });
    }

    // 4. Validate price filtering parameters (min_price & max_price)
    let parsedMinPrice = null;
    if (min_price !== undefined) {
      parsedMinPrice = Number(min_price);
      if (isNaN(parsedMinPrice) || parsedMinPrice < 0) {
        return res.status(400).json({
          message: 'Invalid min_price parameter. Must be a non-negative number',
        });
      }
    }

    let parsedMaxPrice = null;
    if (max_price !== undefined) {
      parsedMaxPrice = Number(max_price);
      if (isNaN(parsedMaxPrice) || parsedMaxPrice < 0) {
        return res.status(400).json({
          message: 'Invalid max_price parameter. Must be a non-negative number',
        });
      }
    }

    if (parsedMinPrice !== null && parsedMaxPrice !== null && parsedMinPrice > parsedMaxPrice) {
      return res.status(400).json({
        message: 'min_price cannot be greater than max_price',
      });
    }

    // 5. Construct parameterized query
    const conditions = [];
    const params = [];

    // Partial title search
    if (typeof search_q === 'string' && search_q.trim() !== '') {
      conditions.push('title LIKE ?');
      params.push(`%${search_q.trim()}%`);
    }

    // Price range filters
    if (parsedMinPrice !== null) {
      conditions.push('price >= ?');
      params.push(parsedMinPrice);
    }

    if (parsedMaxPrice !== null) {
      conditions.push('price <= ?');
      params.push(parsedMaxPrice);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM books ${whereClause} ORDER BY ${normalizedOrderBy} ${normalizedOrder} LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const books = await db.all(sql, params);
    return res.status(200).json(books);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /books/:id
 * Retrieve a single book record by ID.
 */
app.get('/books/:id', async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const book = await db.get('SELECT * FROM books WHERE id = ?', [id]);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    return res.status(200).json(book);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /books
 * Create a new book record.
 */
app.post('/books', validateBookPayload, async (req, res, next) => {
  try {
    const db = getDB();
    const { title, author, price } = req.body;

    const result = await db.run(
      'INSERT INTO books (title, author, price) VALUES (?, ?, ?)',
      [title.trim(), author.trim(), price]
    );

    return res.status(201).json({
      id: result.lastID,
      message: 'Book created successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /books/:id
 * Update an existing book record.
 */
app.put('/books/:id', validateBookPayload, async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { title, author, price } = req.body;

    const result = await db.run(
      'UPDATE books SET title = ?, author = ?, price = ? WHERE id = ?',
      [title.trim(), author.trim(), price, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    return res.status(200).json({
      message: 'Book updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /books/:id
 * Delete a book record by ID.
 */
app.delete('/books/:id', async (req, res, next) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const result = await db.run('DELETE FROM books WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    return res.status(200).json({
      message: 'Book deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ----------------------------------------------------
// Fallback & Global Error Handlers
// ----------------------------------------------------

// 404 for undefined routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// 500 Uniform Error Handler for runtime/database exceptions
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

/**
 * Server Initialization
 */
const startServer = async () => {
  try {
    await initializeDB();
    console.log('Database initialized successfully.');

    // Only listen if not imported as a module (e.g. for testing)
    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;

